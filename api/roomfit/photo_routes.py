"""Authenticated photo workflow, using the existing sessions, CSRF and personal catalog."""
import hashlib
import json
import math
import os
import re
from datetime import timedelta
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict, model_validator
from sqlalchemy import select, delete
from .database import PersonalFurniture, Project, Share, Session as LoginSession, User, now, uid
from .photo_models import PhotoJob, PhotoCharge
from .photo_storage import MAX_UPLOAD, MIME, validate_image, write_image, job_folder, check_capacity
from .photo_processing import blender_path
from .photo_jobs import ESTIMATED_CREDITS, ACTIVE, enabled, setting, reserve, lock_queue, job_view, settle

CATEGORIES = {"chair":"Стулья", "wardrobe":"Шкафы", "dresser":"Комоды", "table":"Столы", "bed":"Кровати", "sofa":"Диваны", "armchair":"Кресла", "desk":"Столы", "nightstand":"Тумбы", "shelf":"Стеллажи", "other":"Декор"}


class PhotoSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    name: str = Field(min_length=1,max_length=120)
    category: str
    description: str = Field(default="",max_length=1000)
    width: float = Field(ge=10,le=20000)
    depth: float = Field(ge=10,le=20000)
    height: float = Field(ge=10,le=20000)
    yaw: int = Field(default=0,ge=-360,le=360)
    dimensionsSource: str = "estimated"

    @model_validator(mode="after")
    def check(self):
        self.name=self.name.strip()
        if not self.name or self.category not in CATEGORIES or self.dimensionsSource not in ("estimated","measured"):
            raise ValueError("Проверь название, категорию и размеры")
        return self


class CreatePhotoJob(PhotoSpec):
    idempotencyKey: UUID


class StartJob(BaseModel):
    confirmCredits: bool


def owned_job(session,user,job_id):
    job=session.get(PhotoJob,str(job_id))
    if not job or job.owner_id!=user.id:
        raise HTTPException(404,"Модель не найдена")
    return job


def validate_references(document, session=None, owner=None):
    for variant in document.get("variants",[]):
        for item in variant.get("items",[]):
            validate_reference(item,session,owner)


def validate_reference(item,session=None,owner=None):
    asset=item.get("photoAsset")
    if not asset:
        return
    if not session or not owner or item.get("assetId") or item.get("assetVersion") or item.get("materialVariant"):
        raise ValueError("Личная 3D-модель доступна только владельцу")
    job=session.get(PhotoJob,asset.get("jobId"))
    record=job.assets.get(str(asset.get("version"))) if job and job.owner_id==owner else None
    if not record or not record.get("reviewed") or record.get("asset")!=asset:
        raise ValueError("Версия личной модели недоступна или её метаданные изменены")


def catalog_item(job, asset):
    return {"name":job.spec["name"],"type":job.spec["category"],"category":CATEGORIES[job.spec["category"]],"width":job.spec["width"],"depth":job.spec["depth"],"height":job.spec["height"],"color":"#ffffff","clearance":0,"tags":["Моя мебель","По фото"],"photoAsset":asset,"contour":asset["footprints"]["collision"][0]["outer"]}


def check_drafts(session, owner):
    drafts=session.scalars(select(PhotoJob).where(PhotoJob.owner_id==owner,PhotoJob.status=="draft")).all()
    if sum(not d.spec.get("_archived") for d in drafts)>=10:
        raise HTTPException(409,"Сначала удали лишние черновики: можно хранить до 10")


def install_photo_routes(app,require_user,db):
    router=APIRouter(prefix="/api/photo-furniture",tags=["Моя мебель по фото"])

    @router.get("/options")
    def options(user=Depends(require_user)):
        available=enabled() and bool(blender_path())
        return {"available":available,"reason":None if available else "Создание мебели по фото пока не настроено. Можно сохранить фото и размеры", "estimatedCredits":ESTIMATED_CREDITS,"maxUploadBytes":MAX_UPLOAD,"userDailyLimit":setting("TRIPO_USER_DAILY_LIMIT",1),"categories":CATEGORIES}

    @router.get("/jobs")
    def jobs(user=Depends(require_user),session=Depends(db)):
        records=session.scalars(select(PhotoJob).where(PhotoJob.owner_id==user.id).order_by(PhotoJob.created_at.desc()).limit(100))
        return [job_view(j) for j in records if not j.spec.get("_archived")]

    @router.post("/jobs",status_code=201)
    def create(data:CreatePhotoJob,user=Depends(require_user),session=Depends(db)):
        key=hashlib.sha256((user.id+str(data.idempotencyKey)).encode()).hexdigest()
        spec=data.model_dump(exclude={"idempotencyKey"})
        fingerprint=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()).hexdigest()
        lock_queue(session)
        previous=session.scalar(select(PhotoJob).where(PhotoJob.idempotency_key==key))
        if previous:
            if previous.spec.get("_create_hash")!=fingerprint:
                raise HTTPException(409,"Эта отправка уже использована для другой модели")
            return job_view(previous)
        check_drafts(session,user.id)
        job=PhotoJob(owner_id=user.id,idempotency_key=key,spec={**spec,"_create_hash":fingerprint})
        session.add(job)
        session.commit()
        return job_view(job)

    @router.get("/jobs/{job_id}")
    def get_job(job_id:UUID,user=Depends(require_user),session=Depends(db)):
        return job_view(owned_job(session,user,job_id))

    @router.put("/jobs/{job_id}")
    def edit_job(job_id:UUID,data:PhotoSpec,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        if job.status!="draft":
            raise HTTPException(409,"После генерации размеры меняются через подготовку модели")
        job.spec={**job.spec,**data.model_dump()}
        job.updated_at=now()
        session.commit()
        return job_view(job)

    @router.put("/jobs/{job_id}/images/{view}")
    async def upload(job_id:UUID,view:str,request:Request,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        if job.status!="draft" or view not in ("front","left","back","right"):
            raise HTTPException(409,"Сейчас фотографию изменить нельзя")
        raw=bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw)>MAX_UPLOAD:
                raise HTTPException(413,"Фото должно быть не больше 8 МБ")
        crop=None
        if request.query_params.get("crop"):
            try:
                crop=[float(n) for n in request.query_params["crop"].split(",")]
                if len(crop)!=4 or any(not math.isfinite(n) or not 0<=n<=1 for n in crop) or crop[2]<=0 or crop[3]<=0 or crop[0]+crop[2]>1 or crop[1]+crop[3]>1:
                    raise ValueError()
            except ValueError:
                raise HTTPException(422,"Проверь границы обрезки")
        try:
            normalized=validate_image(bytes(raw),request.headers.get("content-type","").split(";")[0],crop)
            lock_queue(session)
            session.refresh(job)
            if job.status!="draft":
                raise HTTPException(409,"Генерация уже запущена; фотографию изменить нельзя")
            write_image(user.id,job.id,view,bytes(raw),normalized)
        except ValueError as error:
            raise HTTPException(422,str(error))
        job.images=[i for i in job.images if i["view"]!=view]+[{"view":view,"sha256":hashlib.sha256(normalized).hexdigest()}]
        job.updated_at=now()
        session.commit()
        return job_view(job)

    @router.delete("/jobs/{job_id}/images/{view}")
    def delete_image(job_id:UUID,view:str,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        if job.status!="draft" or view not in ("front","left","back","right"):
            raise HTTPException(409,"Сейчас фотографию изменить нельзя")
        job.images=[i for i in job.images if i["view"]!=view]
        folder=job_folder(user.id,job.id)
        (folder/f"input-{view}.png").unlink(missing_ok=True)
        (folder/f"original-{view}.bin").unlink(missing_ok=True)
        session.commit()
        return job_view(job)

    @router.get("/jobs/{job_id}/images/{view}")
    def image(job_id:UUID,view:str,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        if view not in {i["view"] for i in job.images}:
            raise HTTPException(404,"Фото не найдено")
        path=job_folder(user.id,job.id)/f"input-{view}.png"
        if not path.is_file():
            raise HTTPException(404,"Фото не найдено")
        return FileResponse(path,media_type="image/png")

    @router.post("/jobs/{job_id}/start")
    def start(job_id:UUID,data:StartJob,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        lock_queue(session)
        session.refresh(job)
        if job.status!="draft":
            return job_view(job) # repeated clicks cannot submit a second provider task
        if not data.confirmCredits:
            raise HTTPException(422,"Подтверди расход кредитов перед генерацией")
        if not enabled() or not blender_path():
            raise HTTPException(503,"Создание мебели по фото пока не настроено")
        if "front" not in {i["view"] for i in job.images}:
            raise HTTPException(422,"Сначала загрузи основное фото спереди")
        try:
            reserve(session,job)
        except ValueError as error:
            session.rollback()
            raise HTTPException(429,str(error))
        session.refresh(job)
        if job.status!="draft":
            session.rollback()
            return job_view(job)
        job.status,job.phase="queued","Ожидаем свободное место"
        job.deadline=now()+timedelta(minutes=45)
        job.next_run_at=now()
        session.commit()
        return job_view(job)

    @router.post("/jobs/{job_id}/cancel")
    def cancel(job_id:UUID,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        lock_queue(session)
        session.refresh(job)
        if job.status not in ACTIVE|{"draft"}:
            raise HTTPException(409,"Эта задача уже завершена")
        if job.status in ("draft","queued"):
            settle(session,job,released=True)
        job.status,job.phase="cancelled","Обработка остановлена"
        job.error="Если Tripo уже начал генерацию, он может списать кредиты за результат"
        session.commit()
        return job_view(job)

    @router.post("/jobs/{job_id}/reprocess")
    def reprocess(job_id:UUID,data:PhotoSpec,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        lock_queue(session)
        session.refresh(job)
        if job.status not in ("ready_for_review","completed","failed"):
            raise HTTPException(409,"Исходная модель пока недоступна для обработки")
        local_model=(job_folder(user.id,job.id)/"original.glb").is_file()
        if not local_model and not (job.provider_task_id and job.spec.get("_provider_finished")):
            raise HTTPException(409,"Tripo ещё не вернул готовую модель. Повторная платная отправка не запускалась")
        if job.version>=20:
            raise HTTPException(409,"Достигнут лимит версий этой модели. Обратись в поддержку")
        try:
            check_capacity(user.id,150_000_000)
        except ValueError as error:
            raise HTTPException(409,str(error))
        job.spec={**job.spec,**data.model_dump()}
        job.version+=1
        job.status,job.phase,job.error=("processing" if local_model else "downloading"),"Подготавливаем существующую модель без новой AI-генерации",None
        job.deadline=now()+timedelta(minutes=20)
        job.next_run_at=now()
        job.attempts=0
        session.commit()
        return job_view(job)

    @router.post("/jobs/{job_id}/confirm")
    def confirm(job_id:UUID,data:PhotoSpec,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        lock_queue(session)
        session.refresh(job)
        current=job.assets.get(str(job.version))
        if job.status not in ("ready_for_review","completed") or not current:
            raise HTTPException(409,"Модель пока не готова к сохранению")
        if any(data.model_dump()[key]!=job.spec[key] for key in ("width","depth","height","yaw")):
            raise HTTPException(409,"Сначала примени новые размеры или ориентацию")
        job.spec={**job.spec,**data.model_dump()}
        job.assets={**job.assets,str(job.version):{**current,"reviewed":True}}
        furniture=session.get(PersonalFurniture,job.furniture_id) if job.furniture_id else None
        if not furniture:
            furniture=PersonalFurniture(owner_id=user.id,data={})
            session.add(furniture)
            session.flush()
            job.furniture_id=furniture.id
        furniture.data=catalog_item(job,current["asset"])
        job.status,job.phase="completed","Сохранено в моей мебели"
        job.updated_at=now()
        session.commit()
        return {"job":job_view(job),"furniture":{**furniture.data,"id":furniture.id}}

    @router.post("/jobs/{job_id}/copy",status_code=201)
    def copy_job(job_id:UUID,user=Depends(require_user),session=Depends(db)):
        import shutil
        old=owned_job(session,user,job_id)
        lock_queue(session)
        check_drafts(session,user.id)
        source=job_folder(user.id,old.id)
        files=[source/filename for entry in old.images for filename in (f"input-{entry['view']}.png",f"original-{entry['view']}.bin")]
        if any(not p.is_file() for p in files):
            raise HTTPException(409,"Исходные фото недоступны. Добавь фотографии заново")
        try:
            check_capacity(user.id,sum(p.stat().st_size for p in files))
        except ValueError as error:
            raise HTTPException(409,str(error))
        new=PhotoJob(owner_id=user.id,idempotency_key=hashlib.sha256((user.id+uid()).encode()).hexdigest(),spec={k:v for k,v in old.spec.items() if not k.startswith("_")},images=old.images)
        session.add(new)
        session.flush()
        target=job_folder(user.id,new.id)
        target.mkdir(parents=True,exist_ok=True)
        for entry in old.images:
            for filename in (f"input-{entry['view']}.png",f"original-{entry['view']}.bin"):
                shutil.copyfile(job_folder(user.id,old.id)/filename,target/filename)
        session.commit()
        return job_view(new)

    @router.delete("/jobs/{job_id}")
    def remove(job_id:UUID,user=Depends(require_user),session=Depends(db)):
        job=owned_job(session,user,job_id)
        if job.status in ACTIVE or job.lease_until and job.lease_until>now():
            raise HTTPException(409,"Сначала дождись завершения обработки или останови её")
        if job.furniture_id:
            session.execute(delete(PersonalFurniture).where(PersonalFurniture.id==job.furniture_id,PersonalFurniture.owner_id==user.id))
        job.spec={**job.spec,"_archived":True}
        # Versioned files remain valid for already saved rooms and their revision history.
        session.commit()
        return {"ok":True}

    @router.get("/assets/{job_id}/{version}/{filename:path}")
    def asset_file(job_id:UUID,version:int,filename:str,request:Request,session=Depends(db)):
        job=session.get(PhotoJob,str(job_id))
        if not job or str(version) not in job.assets:
            raise HTTPException(404,"Модель не найдена")
        allowed={"3d/model.glb":"model/gltf-binary","2d/technical.svg":"image/svg+xml","previews/isometric.webp":"image/webp", "2d/original/top_view_1024.png":"image/png",**{f"2d/original/top_view_{s}.webp":"image/webp" for s in (128,256,512)}}
        if filename not in allowed:
            raise HTTPException(404,"Файл не найден")
        try:
            owner=require_user(request,session).id==job.owner_id
        except HTTPException:
            owner=False
        permitted=owner
        if not owner and job.assets[str(version)].get("reviewed"):
            for name,token in list(request.cookies.items())[:40]:
                if not name.startswith("roomfit_photo_share_") or len(token)>120:
                    continue
                share=session.scalar(select(Share).where(Share.token==hashlib.sha256(token.encode()).hexdigest(),Share.expires_at>now()))
                project=session.get(Project,share.project_id) if share else None
                if project and project.owner_id==job.owner_id and project.deleted_at is None:
                    permitted=any(i.get("photoAsset",{}).get("jobId")==job.id and i["photoAsset"].get("version")==version for v in project.document["variants"] for i in v["items"])
                if permitted:
                    break
        if not permitted:
            raise HTTPException(404,"Файл не найден")
        path=job_folder(job.owner_id,job.id)/f"v{version}"/filename
        if not path.is_file():
            raise HTTPException(404,"Файл не найден")
        return FileResponse(path,media_type=allowed[filename])

    app.include_router(router)
