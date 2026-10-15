"""All provider traffic is mocked. These tests must never spend Tripo credits."""
import copy
import hashlib
import io
import json
import shutil
import uuid
from datetime import timedelta
from pathlib import Path
import httpx
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from test_api import clean, client, register, doc, module, database
from roomfit.photo_models import PhotoJob, PhotoCharge
from roomfit.photo_jobs import run_step, claim
from roomfit.photo_routes import catalog_item
from roomfit.photo_storage import job_folder, MAX_UPLOAD
from roomfit.tripo_client import TripoClient, TripoError, safe_download_url, inspect_glb

ROOT=Path(__file__).parents[2]
MANIFEST=json.loads((ROOT/"platform/public/assets/furniture/manifest.json").read_text())
CHAIR=MANIFEST["chair"]
CHAIR_FOLDER=ROOT/"platform/public"/CHAIR["base_url"].lstrip("/")
SPEC=dict(name="Мой синий стул",category="chair",description="Тестовая личная модель",width=450,depth=500,height=850,yaw=0,dimensionsSource="estimated")


@pytest.fixture(autouse=True)
def photo_settings(monkeypatch,tmp_path):
    monkeypatch.setenv("TRIPO_API_KEY","test-key-never-real")
    monkeypatch.setenv("TRIPO_ENABLED","true")
    monkeypatch.setenv("TRIPO_DAILY_CREDIT_LIMIT","200")
    monkeypatch.setenv("TRIPO_TOTAL_CREDIT_LIMIT","0")
    monkeypatch.setenv("TRIPO_USER_DAILY_LIMIT","3")
    monkeypatch.setenv("TRIPO_JOB_CREDIT_RESERVE","40")
    monkeypatch.setenv("TRIPO_MAX_CONCURRENT_JOBS","1")
    monkeypatch.setenv("ROOMFIT_PHOTO_STORAGE",str(tmp_path/"private"))
    monkeypatch.setenv("ROOMFIT_BLENDER",__file__) # existence check only; processor mocked explicitly


def photo_bytes():
    output=io.BytesIO()
    Image.new("RGB",(320,400),"#385f80").save(output,"PNG")
    return output.getvalue()


def create_job(c,extra=None,key=None):
    response=c.post("/api/photo-furniture/jobs",json={**SPEC,**(extra or {}),"idempotencyKey":key or str(uuid.uuid4())})
    assert response.status_code==201,response.text
    return response.json()


def upload(c,job,view="front",raw=None,mime="image/png"):
    return c.put(f"/api/photo-furniture/jobs/{job['id']}/images/{view}",content=raw or photo_bytes(),headers={"Content-Type":mime})


def start(c,job):
    return c.post(f"/api/photo-furniture/jobs/{job['id']}/start",json={"confirmCredits":True})


def fake_process(source,destination,spec,job_id,version):
    destination=Path(destination)
    shutil.copytree(CHAIR_FOLDER,destination,dirs_exist_ok=True)
    asset={"jobId":job_id,"version":version,"dimensions":CHAIR["dimensions"],"frame":CHAIR["top_frame_mm"],"footprints":{key:CHAIR["footprints"][key] for key in ("visual","collision","volumes")},"triangles":CHAIR["triangles"],"glbBytes":CHAIR["glb_bytes"],"modelSha256":hashlib.sha256((destination/"3d/model.glb").read_bytes()).hexdigest()}
    return {"asset":asset,"report":{"proportions_changed":False,"scale_factors":[1,1,1],"silhouette_iou":1,"test_fixture":True},"reviewed":False}


def provider_factory(calls):
    def respond(request):
        calls.append((request.method,request.url.path))
        if request.url.path.endswith("/files"):
            return httpx.Response(200,json={"code":0,"data":{"file_token":"file_test"}})
        if request.url.path.endswith("/account/balance"):
            return httpx.Response(200,json={"code":0,"data":{"balance":500,"frozen":0}})
        if "/generation/" in request.url.path:
            data=json.loads(request.content)
            assert data["model"]=="v3.1-20260211"
            assert data["face_limit"]==50000 and data["texture"] and data["pbr"]
            assert "prompt" not in data and "type" not in data
            if "multiview" in request.url.path:
                assert data["inputs"]==[{"front":"file_test"},{"back":"file_test"}]
            else:
                assert data["input"]=="file_test"
            return httpx.Response(200,json={"code":0,"data":{"task_id":"task_test"}})
        return httpx.Response(200,json={"code":0,"data":{"status":"success","progress":100,"output":{"model_url":"https://cdn.tripo3d.ai/model.glb"},"credits_consumed":40}})
    class MockClient(TripoClient):
        def __init__(self):
            super().__init__(key="mock",transport=httpx.MockTransport(respond))
        def download_model(self,url,destination):
            assert url=="https://cdn.tripo3d.ai/model.glb"
            shutil.copyfile(CHAIR_FOLDER/"3d/model.glb",destination)
    return MockClient


def complete(c,job,multiview=False):
    assert upload(c,job).status_code==200
    if multiview:
        assert upload(c,job,"back").status_code==200
    assert start(c,job).status_code==200
    calls=[]
    for _ in range(4):
        run_step(job["id"],provider_factory(calls),fake_process)
    result=c.get("/api/photo-furniture/jobs/"+job["id"]).json()
    assert result["status"]=="ready_for_review",result
    return result,calls


def instance(catalog,document):
    return {**{k:v for k,v in catalog.items() if k not in ("id","tags")},"id":str(uuid.uuid4()),"catalogId":catalog["id"],"floorId":document["floors"][0]["id"],"x":2000,"y":1600,"angle":45,"locked":False,"shopping":{"owned":True,"price":0,"store":"","url":"","note":""}}


def test_photo_auth_content_and_idempotency(client):
    assert client.get("/api/photo-furniture/jobs").status_code==401
    register(client)
    key=str(uuid.uuid4())
    job=create_job(client,key=key)
    assert create_job(client,key=key)["id"]==job["id"]
    assert client.post("/api/photo-furniture/jobs",json={**SPEC,"name":"Другой","idempotencyKey":key}).status_code==409
    assert upload(client,job,raw=b"invalid").status_code==422
    assert upload(client,job,mime="image/jpeg").status_code==422
    assert upload(client,job,raw=b"x"*(MAX_UPLOAD+1)).status_code==413
    assert upload(client,job).status_code==200
    assert client.get(f"/api/photo-furniture/jobs/{job['id']}/images/front").headers["content-type"].startswith("image/png")
    assert client.put(f"/api/photo-furniture/jobs/{job['id']}/images/back?crop=0,0,2,1",content=photo_bytes(),headers={"Content-Type":"image/png"}).status_code==422
    assert client.put(f"/api/photo-furniture/jobs/{job['id']}/images/back",content=photo_bytes(),headers={"Content-Type":"image/png","X-CSRF-Token":"wrong"}).status_code==403


@pytest.mark.parametrize("field,value",[("width",0),("height",float("inf")),("category","not-a-category")])
def test_dimensions_and_category(client,field,value):
    register(client)
    if isinstance(value,float) and value==float("inf"):
        value="Infinity"
    response=client.post("/api/photo-furniture/jobs",json={**SPEC,field:value,"idempotencyKey":str(uuid.uuid4())})
    assert response.status_code==422


def test_multiview_pipeline_confirm_save_reopen_and_shared_rights(client):
    register(client)
    job,calls=complete(client,create_job(client),multiview=True)
    assert sum("/generation/" in path for _,path in calls)==1
    confirmed=client.post(f"/api/photo-furniture/jobs/{job['id']}/confirm",json=SPEC)
    assert confirmed.status_code==200,confirmed.text
    furniture=confirmed.json()["furniture"]
    assert len(client.get("/api/furniture").json())==1
    assert client.post(f"/api/photo-furniture/jobs/{job['id']}/confirm",json=SPEC).json()["furniture"]["id"]==furniture["id"]
    document=doc(); document["variants"][0]["items"]=[instance(furniture,document)]
    response=client.post("/api/projects",json={"document":document})
    assert response.status_code==201,response.text
    project=response.json()
    assert client.get("/api/projects/"+project["id"]).json()["document"]["variants"][0]["items"][0]["photoAsset"]==furniture["photoAsset"]
    path=f"/api/photo-furniture/assets/{job['id']}/1/3d/model.glb"
    assert client.get(path).content[:4]==b"glTF"
    with TestClient(module.app) as outsider:
        assert outsider.get(path).status_code==404
        token=client.post(f"/api/projects/{project['id']}/shares",json={}).json()
        assert outsider.get("/api/shared/"+token["token"]).status_code==200
        assert outsider.get(path).status_code==200
        assert outsider.get(f"/api/photo-furniture/jobs/{job['id']}/images/front").status_code==401
        assert client.delete(f"/api/projects/{project['id']}/shares/{token['id']}").status_code==200
        assert outsider.get(path).status_code==404
    assert client.delete("/api/photo-furniture/jobs/"+job["id"]).status_code==200
    assert client.get("/api/furniture").json()==[]
    assert client.get(path).status_code==200 # existing room and history retain their version
    with database.SessionLocal() as session:
        charge=session.get(PhotoCharge,job["id"])
        assert charge.state=="spent" and charge.spent==4000


def test_forged_geometry_and_other_users_cannot_reference_model(client):
    register(client)
    job,_=complete(client,create_job(client))
    furniture=client.post(f"/api/photo-furniture/jobs/{job['id']}/confirm",json=SPEC).json()["furniture"]
    document=doc(); document["variants"][0]["items"]=[instance(furniture,document)]
    document["variants"][0]["items"][0]["photoAsset"]["dimensions"]["width_mm"]+=100
    assert client.post("/api/projects",json={"document":document}).status_code==422
    with TestClient(module.app) as other:
        other.headers["X-CSRF-Token"]=other.get("/api/auth/me").json()["csrf"]
        register(other,"other@example.com")
        assert other.get("/api/photo-furniture/jobs/"+job["id"]).status_code==404
        document["variants"][0]["items"][0]=instance(furniture,document)
        assert other.post("/api/projects",json={"document":document}).status_code==422


def test_confirm_requires_processing_and_explicit_spending_consent(client):
    register(client)
    job=create_job(client)
    assert start(client,job).status_code==422
    assert upload(client,job).status_code==200
    assert client.post(f"/api/photo-furniture/jobs/{job['id']}/start",json={"confirmCredits":False}).status_code==422
    assert client.post(f"/api/photo-furniture/jobs/{job['id']}/confirm",json=SPEC).status_code==409


def test_daily_budget_duplicate_start_and_cancel_before_submission(client,monkeypatch):
    monkeypatch.setenv("TRIPO_DAILY_CREDIT_LIMIT","40")
    register(client)
    first=create_job(client);upload(client,first)
    assert start(client,first).status_code==200
    assert start(client,first).status_code==200
    second=create_job(client);upload(client,second)
    assert start(client,second).status_code==429
    with database.SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(PhotoCharge))==1
    assert client.post(f"/api/photo-furniture/jobs/{first['id']}/cancel",json={}).status_code==200
    assert start(client,second).status_code==200


def test_uncertain_submission_is_never_retried_or_refunded(client):
    register(client)
    job=create_job(client);upload(client,job);start(client,job)
    calls=[]
    class Uncertain(provider_factory(calls)):
        def create_image_to_model_task(self,token):
            calls.append(("POST","paid-uncertain"))
            raise TripoError("Lost task creation response",uncertain=True)
    run_step(job["id"],Uncertain,fake_process)
    run_step(job["id"],Uncertain,fake_process)
    assert calls.count(("POST","paid-uncertain"))==1
    with database.SessionLocal() as session:
        assert session.get(PhotoJob,job["id"]).status=="failed"
        assert session.get(PhotoCharge,job["id"]).state=="uncertain"


def test_crashed_submission_and_expired_leases_are_recovered_safely(client):
    register(client)
    job=create_job(client);upload(client,job);start(client,job)
    with database.SessionLocal() as session:
        saved=session.get(PhotoJob,job["id"])
        saved.status="generating";saved.lease_until=database.now()-timedelta(seconds=1)
        session.commit()
    assert claim()==job["id"]
    run_step(job["id"],lambda: pytest.fail("must not submit again"),fake_process)
    assert client.get("/api/photo-furniture/jobs/"+job["id"]).json()["status"]=="failed"


def test_credit_history_survives_account_deletion(client,monkeypatch):
    monkeypatch.setenv("TRIPO_DAILY_CREDIT_LIMIT","40")
    owner=register(client)
    job,_=complete(client,create_job(client))
    assert client.request("DELETE","/api/profile",json={"currentPassword":"secure-test-password"}).status_code==200
    assert not job_folder(owner["id"],job["id"]).exists()
    register(client,"replacement@example.com")
    next_job=create_job(client);upload(client,next_job)
    assert start(client,next_job).status_code==429


def test_provider_rejects_legacy_parameters_and_never_retries_paid_post():
    calls=[]
    def fail(request):
        calls.append(request.url.path)
        raise httpx.ReadTimeout("test timeout",request=request)
    provider=TripoClient("test",httpx.MockTransport(fail))
    with pytest.raises(TripoError) as caught:
        provider.create_image_to_model_task("file_test")
    assert caught.value.uncertain and len(calls)==1
    provider.close()


@pytest.mark.parametrize("url",["http://cdn.tripo3d.ai/x","https://localhost/x","https://cdn.tripo3d.ai.evil.test/x","https://cdn.tripo3d.ai:444/x","https://user:pass@cdn.tripo3d.ai/x"])
def test_download_ssrf_guards(url):
    with pytest.raises(TripoError):
        safe_download_url(url)


def test_corrupt_glb_is_rejected(tmp_path):
    target=tmp_path/"invalid.glb";target.write_bytes(b"not a GLB")
    with pytest.raises(ValueError):
        inspect_glb(target)


def test_failed_download_can_resume_without_a_second_generation(client):
    register(client)
    job=create_job(client); upload(client,job); start(client,job)
    calls=[]
    provider=provider_factory(calls)
    run_step(job["id"],provider,fake_process)
    run_step(job["id"],provider,fake_process)
    with database.SessionLocal() as session:
        saved=session.get(PhotoJob,job["id"]); saved.status="failed"; saved.error="download interrupted"; session.commit()
    result=client.post(f"/api/photo-furniture/jobs/{job['id']}/reprocess",json=SPEC)
    assert result.status_code==200 and result.json()["status"]=="downloading"
    run_step(job["id"],provider,fake_process)
    run_step(job["id"],provider,fake_process)
    assert client.get("/api/photo-furniture/jobs/"+job["id"]).json()["status"]=="ready_for_review"
    assert sum("/generation/" in path for _,path in calls)==1


def test_copy_cannot_bypass_draft_limit_or_storage_quota(client,monkeypatch):
    register(client)
    first=create_job(client); upload(client,first)
    for _ in range(9):
        assert client.post(f"/api/photo-furniture/jobs/{first['id']}/copy",json={}).status_code==201
    assert client.post(f"/api/photo-furniture/jobs/{first['id']}/copy",json={}).status_code==409
    monkeypatch.setenv("ROOMFIT_PHOTO_USER_STORAGE_MB","0")
    assert upload(client,first,"back").status_code==422


def test_account_deletion_during_processing_removes_late_derivatives(client):
    owner=register(client)
    job=create_job(client); upload(client,job); start(client,job)
    calls=[]; provider=provider_factory(calls)
    for _ in range(3): run_step(job["id"],provider,fake_process)
    def deleting_processor(source,destination,*args):
        # A second API request can delete the account while Blender is working.
        assert client.request("DELETE","/api/profile",json={"currentPassword":"secure-test-password"}).status_code==200
        return fake_process(source,destination,*args)
    run_step(job["id"],provider,deleting_processor)
    assert not job_folder(owner["id"],job["id"]).exists()


def test_total_budget_survives_the_next_day_and_queue_serializes_provider_jobs(client,monkeypatch):
    register(client)
    first=create_job(client);upload(client,first);start(client,first)
    second=create_job(client);upload(client,second);start(client,second)
    run_step(first["id"],provider_factory([]),fake_process)
    with database.SessionLocal() as session:
        # The first task is not due yet; the second must not start in parallel.
        saved=session.get(PhotoJob,first["id"]);saved.next_run_at=database.now()+timedelta(seconds=30);session.commit()
    assert claim() is None
    with database.SessionLocal() as session:
        saved=session.get(PhotoJob,first["id"]);saved.next_run_at=database.now();session.commit()
    assert claim()==first["id"]
    client.post(f"/api/photo-furniture/jobs/{second['id']}/cancel",json={})
    monkeypatch.setenv("TRIPO_TOTAL_CREDIT_LIMIT","40")
    with database.SessionLocal() as session:
        charge=session.get(PhotoCharge,first["id"]);charge.day="2026-01-01";charge.state="spent";charge.spent=4000;session.commit()
    third=create_job(client);upload(client,third)
    response=start(client,third)
    assert response.status_code==429 and "Общий бюджет" in response.json()["detail"]
