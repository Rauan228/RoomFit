"""Durable, leased database queue and auditable credit reservations.

One worker step performs at most one external operation. Creating a paid task is
never automatically repeated after an ambiguous response or crashed submission.
"""
import hashlib
import json
import math
import os
import time
from datetime import timedelta
from sqlalchemy import select, text, func, or_
from .database import SessionLocal, now
from .photo_models import PhotoJob, PhotoCharge, PhotoLock
from .photo_storage import job_folder, remove_job, check_capacity
from .photo_processing import process_model
from .tripo_client import TripoClient, TripoError

ACTIVE = {"queued", "uploading", "generating", "downloading", "processing", "validating"}
ESTIMATED_CREDITS = 40  # H-series standard geometry + detailed texture, verified 2026-10-15


class JobRemoved(Exception):
    pass


def refresh_job(session, job):
    if not session.scalar(select(PhotoJob.id).where(PhotoJob.id==job.id)):
        raise JobRemoved()
    session.refresh(job)


def setting(name, default):
    return int(os.getenv(name, str(default)))


def enabled():
    return os.getenv("TRIPO_ENABLED", "false").lower() == "true" and bool(os.getenv("TRIPO_API_KEY")) and setting("TRIPO_DAILY_CREDIT_LIMIT", 0) >= ESTIMATED_CREDITS


def owner_hash(owner):
    return hashlib.sha256(owner.encode()).hexdigest()


def lock_queue(session):
    # SQLite needs an actual write transaction; PostgreSQL uses the singleton row lock.
    if session.bind.dialect.name == "sqlite":
        driver = session.connection().connection.driver_connection
        if not driver.in_transaction:
            session.execute(text("BEGIN IMMEDIATE"))
    session.execute(text("INSERT INTO photo_furniture_locks (key) VALUES ('global') ON CONFLICT (key) DO NOTHING"))
    session.scalar(select(PhotoLock).where(PhotoLock.key == "global").with_for_update())


def reserve(session, job):
    lock_queue(session)
    day = now().date().isoformat()
    charges = session.scalars(select(PhotoCharge).where(PhotoCharge.day == day)).all()
    used = sum(c.spent if c.spent is not None else c.reserved for c in charges if c.state != "released")
    reserve_amount = max(ESTIMATED_CREDITS, setting("TRIPO_JOB_CREDIT_RESERVE", ESTIMATED_CREDITS))*100
    total_limit = setting("TRIPO_TOTAL_CREDIT_LIMIT", 0)
    if total_limit > 0:
        all_charges=session.scalars(select(PhotoCharge).where(PhotoCharge.state!="released")).all()
        total=sum(c.spent if c.spent is not None else c.reserved for c in all_charges)
        if total + reserve_amount > total_limit*100:
            raise ValueError("Общий бюджет генераций исчерпан. Сохранённые модели доступны; для новых обратись к владельцу RoomFit")
    if used + reserve_amount > setting("TRIPO_DAILY_CREDIT_LIMIT", 0)*100:
        raise ValueError("На сегодня закончился бюджет генераций. Попробуй завтра")
    personal = sum(c.owner_hash == owner_hash(job.owner_id) and c.state != "released" for c in charges)
    if personal >= setting("TRIPO_USER_DAILY_LIMIT", 1):
        raise ValueError("Лимит генераций на сегодня исчерпан. Попробуй завтра")
    session.add(PhotoCharge(job_id=job.id, owner_hash=owner_hash(job.owner_id), day=day, reserved=reserve_amount))


def settle(session, job, credits=None, released=False):
    charge = session.get(PhotoCharge, job.id)
    if charge and charge.state in ("reserved", "uncertain"):
        if released:
            charge.state, charge.spent = "released", 0
        elif credits is not None:
            amount = float(credits)
            if not math.isfinite(amount) or amount < 0 or amount > 100000:
                raise ValueError("Invalid provider credit accounting")
            charge.state, charge.spent = "spent", math.ceil(amount*100)


def job_view(job):
    result = dict(id=job.id, status=job.status, spec={k:v for k,v in job.spec.items() if not k.startswith("_")}, images=[{"view":i["view"],"url":f"/api/photo-furniture/jobs/{job.id}/images/{i['view']}"} for i in job.images], progress=job.progress, phase=job.phase, error=job.error, version=job.version, furnitureId=job.furniture_id, createdAt=job.created_at.isoformat()+"Z", updatedAt=job.updated_at.isoformat()+"Z")
    current = job.assets.get(str(job.version))
    if current:
        result["result"] = current
    result["creditsConsumed"] = job.spec.get("_credits_consumed")
    return result


def claim():
    with SessionLocal() as session:
        lock_queue(session)
        current = now()
        running = session.scalar(select(func.count()).select_from(PhotoJob).where(PhotoJob.lease_until > current))
        maximum=max(1, min(4, setting("TRIPO_MAX_CONCURRENT_JOBS", 1)))
        if running >= maximum:
            session.commit()
            return None
        in_flight=session.scalar(select(func.count()).select_from(PhotoJob).where(PhotoJob.status.in_(ACTIVE-{"queued"})))
        job = session.scalar(select(PhotoJob).where(
            or_(PhotoJob.status.in_(ACTIVE), (PhotoJob.status == "cancelled") & PhotoJob.provider_task_id.is_not(None)),
            PhotoJob.next_run_at <= current,
            or_(PhotoJob.lease_until.is_(None), PhotoJob.lease_until < current),
            or_(PhotoJob.status!="queued", in_flight < maximum),
        ).order_by(PhotoJob.next_run_at).limit(1))
        if not job:
            session.commit()
            return None
        if job.status == "cancelled" and job.spec.get("_provider_finished"):
            job.next_run_at = current + timedelta(days=36500)
            session.commit()
            return None
        job.lease_until = current + timedelta(minutes=12)
        session.commit()
        return job.id


def run_step(job_id, client_factory=TripoClient, processor=process_model):
    with SessionLocal() as session:
        lock_queue(session)
        job = session.get(PhotoJob, job_id)
        if not job or job.status not in ACTIVE|{"cancelled"}:
            session.commit()
            return
        if job.status == "cancelled" and not job.provider_task_id:
            session.commit()
            return
        client = None
        owner_id = job.owner_id
        try:
            if job.deadline and job.deadline < now():
                raise ValueError("Генерация превысила время ожидания. Повторная платная отправка не запускалась")
            folder = job_folder(job.owner_id, job.id)
            if job.status in ("queued", "uploading"):
                if not enabled():
                    raise TripoError("Новые генерации временно отключены администратором")
                check_capacity(job.owner_id,150_000_000)
                job.status, job.phase = "uploading", "Загружаем фотографии"
                session.commit()
                client = client_factory()
                tokens = dict(job.spec.get("_tokens", {}))
                for image in job.images:
                    if image["view"] not in tokens:
                        tokens[image["view"]] = client.upload_image(folder / f"input-{image['view']}.png")
                        job.spec = {**job.spec, "_tokens": tokens}
                        session.commit()
                balance = client.get_balance()
                if float(balance.get("balance", 0)) < ESTIMATED_CREDITS:
                    raise TripoError("У сервиса недостаточно кредитов для генерации")
                refresh_job(session,job)
                if job.status == "cancelled":
                    settle(session,job,released=True)
                    session.commit()
                    return
                # Durable marker BEFORE sending: a crash cannot trigger a second paid POST.
                job.status, job.phase = "generating", "Создаём 3D-модель"
                session.commit()
                task_id = client.create_multiview_task(tokens) if len(tokens)>1 else client.create_image_to_model_task(tokens["front"])
                refresh_job(session,job)
                job.provider_task_id = task_id
                if job.status != "cancelled":
                    job.status = "generating"
                session.commit()
            elif job.status in ("generating", "cancelled"):
                if not job.provider_task_id:
                    raise TripoError("Ответ о создании задачи потерян. Повторная платная отправка остановлена; обратись в поддержку", uncertain=True)
                client = client_factory()
                task = client.get_task(job.provider_task_id)
                if task.get("status") in ("queued", "running"):
                    progress = task.get("progress")
                    job.progress = min(100,max(0,int(progress))) if isinstance(progress,(int,float)) else None
                elif task.get("status") in ("failed", "cancelled"):
                    settle(session, job, released=True)
                    job.spec = {**job.spec, "_provider_finished":True, "_credits_consumed":task.get("credits_consumed")}
                    if job.status != "cancelled":
                        raise ValueError("Tripo не смог создать модель. Попробуй другой ракурс или более чистый фон")
                elif task.get("status") == "success":
                    # Missing accounting remains conservatively reserved, never silently refunded.
                    settle(session, job, task.get("credits_consumed"))
                    job.spec = {**job.spec, "_provider_finished":True, "_credits_consumed":task.get("credits_consumed")}
                    if job.status != "cancelled":
                        url = task.get("output",{}).get("model_url")
                        if not isinstance(url,str):
                            raise ValueError("Tripo завершил задачу без модели")
                        job.spec = {**job.spec, "_download_url":url}
                        job.status, job.phase, job.progress = "downloading", "Сохраняем созданную модель", None
                else:
                    raise TripoError("Tripo вернул неизвестный статус задачи", transient=True)
                session.commit()
            elif job.status == "downloading":
                client = client_factory()
                # Refresh a signed URL after a failed download using the existing task, never regenerate.
                task = client.get_task(job.provider_task_id)
                url = task.get("output",{}).get("model_url")
                if not isinstance(url,str):
                    raise TripoError("Ссылка на модель пока недоступна", transient=True)
                client.download_model(url, folder / "original.glb")
                job.status, job.phase = "processing", "Подготавливаем модель и вид сверху"
                session.commit()
            elif job.status in ("processing", "validating"):
                job.phase = "Подготавливаем модель, создаём вид сверху и проверяем размеры"
                session.commit()
                result = processor(folder / "original.glb", folder / f"v{job.version}", job.spec, job.id, job.version)
                refresh_job(session,job)
                if job.status != "cancelled":
                    result["report"]["dimensions_source"] = job.spec.get("dimensionsSource", "measured")
                    result["report"]["source_sha256"] = hashlib.sha256((folder/"original.glb").read_bytes()).hexdigest()
                    (folder/f"v{job.version}"/"validation.json").write_text(json.dumps(result["report"],ensure_ascii=False,indent=2),encoding="utf-8")
                    (folder/f"v{job.version}"/"asset.json").write_text(json.dumps(result["asset"],ensure_ascii=False),encoding="utf-8")
                    job.assets = {**job.assets,str(job.version):result}
                    job.status, job.phase = "ready_for_review", "Проверь результат перед сохранением"
                    job.error = None
                session.commit()
            job.attempts = 0
        except JobRemoved:
            session.rollback()
        except TripoError as error:
            refresh_job(session,job)
            if error.uncertain:
                charge = session.get(PhotoCharge,job.id)
                if charge:
                    charge.state = "uncertain"
            if error.transient and job.attempts < 5 and job.status != "cancelled":
                job.attempts += 1
                job.error = "Сервис временно недоступен. Повторяем текущий этап без новой платной генерации"
            else:
                if not error.uncertain and not job.provider_task_id:
                    settle(session,job,released=True)
                job.status, job.error = "failed", str(error)
        except Exception as error:
            refresh_job(session,job)
            if not job.provider_task_id and job.status in ("queued","uploading"):
                settle(session,job,released=True)
            job.status = "failed"
            job.error = str(error)[:450] if isinstance(error,ValueError) else "Не удалось завершить обработку. Исходная модель сохранена; попробуй повторить обработку"
        finally:
            if client:
                client.close()
            # Account deletion may have removed the job while Blender was running.
            exists=session.scalar(select(PhotoJob.id).where(PhotoJob.id==job_id))
            if exists:
                job.lease_until = None
                job.updated_at = now()
                job.next_run_at = now()+timedelta(seconds=min(120,5*2**job.attempts))
                session.commit()
            else:
                session.rollback()
                remove_job(owner_id,job_id)


def main():
    while True:
        try:
            job_id=claim()
            if job_id:
                run_step(job_id)
            else:
                time.sleep(2)
        except KeyboardInterrupt:
            return
        except Exception:
            # Avoid leaking provider URLs, image data or credentials through tracebacks.
            print("Photo furniture worker: temporary queue failure",flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
