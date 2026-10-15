"""Local-only browser-test worker. No network calls, provider credentials or paid tasks."""
import os
if os.getenv("ROOMFIT_PHOTO_E2E") != "1":
    raise SystemExit("Set ROOMFIT_PHOTO_E2E=1 only for local browser tests")
os.environ.update(APP_ENV="test",COOKIE_SECURE="false",TRIPO_API_KEY="mock-no-real-credits",TRIPO_ENABLED="true",TRIPO_DAILY_CREDIT_LIMIT="5000",TRIPO_USER_DAILY_LIMIT="20",TRIPO_MAX_CONCURRENT_JOBS="1",DATABASE_URL="sqlite:///./data/photo-e2e.db",ROOMFIT_PHOTO_STORAGE="data/photo-e2e-assets",ROOMFIT_BLENDER=__file__)
import json
import shutil
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4
ROOT=Path(__file__).parents[2]
(ROOT/".local").mkdir(exist_ok=True)
os.environ["DATABASE_URL"]="sqlite:///"+(ROOT/".local/photo-e2e.db").as_posix()
os.environ["ROOMFIT_PHOTO_STORAGE"]=str(ROOT/".local/photo-e2e-assets")
os.environ["TRIPO_TOTAL_CREDIT_LIMIT"]="0"
sys.path.insert(0,str(Path(__file__).parents[1]))
from roomfit.app import app
from roomfit.database import Base, engine
from roomfit.photo_jobs import claim, run_step
import uvicorn

CHAIR=json.loads((ROOT/"platform/public/assets/furniture/manifest.json").read_text())["chair"]
SOURCE=ROOT/"platform/public"/CHAIR["base_url"].lstrip("/")


class MockTripo:
    def upload_image(self,path):
        assert Path(path).is_file()
        return "file_mock"
    def get_balance(self):
        return {"balance":5000,"frozen":0}
    def create_image_to_model_task(self,token):
        return "mock_task_"+str(uuid4())
    def create_multiview_task(self,views):
        assert "front" in views and len(views)>=2
        return "mock_multiview_"+str(uuid4())
    def get_task(self,task):
        return {"status":"success","progress":100,"credits_consumed":40,"output":{"model_url":"https://cdn.tripo3d.ai/mock.glb"}}
    def download_model(self,url,destination):
        shutil.copyfile(SOURCE/"3d/model.glb",destination)
    def close(self):
        pass


def mock_processing(source,destination,spec,job_id,version):
    shutil.copytree(SOURCE,destination,dirs_exist_ok=True)
    assert spec["width"]==CHAIR["dimensions"]["width_mm"]
    assert spec["depth"]==CHAIR["dimensions"]["depth_mm"]
    assert spec["height"]==CHAIR["dimensions"]["height_mm"]
    return {"asset":{"jobId":job_id,"version":version,"dimensions":CHAIR["dimensions"],"frame":CHAIR["top_frame_mm"],"footprints":{key:CHAIR["footprints"][key] for key in ("visual","collision","volumes")},"triangles":CHAIR["triangles"],"glbBytes":CHAIR["glb_bytes"],"modelSha256":json.loads((SOURCE/"validation.json").read_text())["model_sha256"]},"reviewed":False,"report":{"test_fixture":True,"proportions_changed":False,"scale_factors":[1,1,1],"silhouette_iou":1}}


def work():
    while True:
        try:
            job=claim()
            if job:
                run_step(job,MockTripo,mock_processing)
        except Exception:
            print("Mock photo worker failed",flush=True)
        time.sleep(.25)


if __name__=="__main__":
    Base.metadata.create_all(engine)
    threading.Thread(target=work,daemon=True).start()
    uvicorn.run(app,host="127.0.0.1",port=4192)
