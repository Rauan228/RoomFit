"""Offline normalization and independent measurement of the actually exported GLB."""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image, ImageFilter
from shapely.geometry import Polygon

FACTORY = Path(__file__).resolve().parents[2] / "asset_factory"


def blender_path():
    executable = os.getenv("ROOMFIT_BLENDER") or shutil.which("blender")
    return executable if executable and Path(executable).is_file() else None


def _validator():
    spec = importlib.util.spec_from_file_location("roomfit_photo_geometry", FACTORY / "validation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def process_model(source, destination, spec, job_id, version):
    executable = blender_path()
    if not executable:
        raise ValueError("Обработка 3D ещё не настроена на сервере")
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    settings = {"dimensions": {"width_mm": spec["width"], "depth_mm": spec["depth"], "height_mm": spec["height"]}, "yaw": spec.get("yaw", 0), "source_forward": spec.get("_source_forward", "+X")}
    settings_path = destination / "settings.json"
    settings_path.write_text(json.dumps(settings), encoding="utf-8")
    with (destination / "processing.log").open("w", encoding="utf-8") as log:
        try:
            result = subprocess.run([str(executable), "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(FACTORY / "blender_photo_import.py"), "--", str(Path(source).resolve()), str(settings_path.resolve()), str(destination.resolve())], stdout=log, stderr=subprocess.STDOUT, timeout=600, check=False)
        except subprocess.TimeoutExpired:
            raise ValueError("Подготовка модели заняла слишком много времени. Можно повторить обработку без новой генерации")
    if result.returncode:
        raise ValueError("Не удалось обработать 3D-модель. Можно повторить обработку без новой генерации")
    return finalize_model(destination, settings["dimensions"], job_id, version)


def finalize_model(folder, dimensions, job_id, version):
    v = _validator()
    folder = Path(folder)
    model = folder / "3d/model.glb"
    document, meshes = v.geometry(model)
    if not meshes:
        raise ValueError("В модели нет геометрии")
    if any(e.get("uri") and not e["uri"].startswith("data:") for field in ("buffers", "images") for e in document.get(field, [])):
        raise ValueError("В модели остались внешние файлы")
    vertices = np.concatenate([mesh["vertices"] for mesh in meshes])
    if not np.isfinite(vertices).all():
        raise ValueError("Некорректные координаты модели")
    low, high = vertices.min(axis=0), vertices.max(axis=0)
    expected = np.array([dimensions["width_mm"], dimensions["height_mm"], dimensions["depth_mm"]])
    error = float(np.abs(high-low-expected).max())
    pivot_error = float(max(abs(low[1]), abs((high[0]+low[0])/2), abs((high[2]+low[2])/2)))
    triangles = sum(len(mesh["triangles"]) for mesh in meshes)
    if error > 1 or pivot_error > 1 or triangles > 60000 or model.stat().st_size > 12_000_000:
        raise ValueError("Модель не прошла проверку размеров или превышает допустимую сложность")
    shape = v.projection(meshes)
    render = json.loads((folder / "render-info.json").read_text())
    frame = render["frame"]
    top_path = folder / "2d/original/top_view_1024.png"
    image = Image.open(top_path).convert("RGBA")
    alpha = np.asarray(image)[:,:,3] > 127
    expected_mask = v.mask(shape, frame, image.size)
    iou = float(np.logical_and(alpha,expected_mask).sum()/max(1,np.logical_or(alpha,expected_mask).sum()))
    if iou < .97 or np.asarray(image)[:,:,3].min() != 0:
        raise ValueError("Вид сверху не соответствует 3D-модели")
    coordinate = np.asarray(Image.open(folder / "coordinates.png").convert("RGBA"))/255
    encoded = coordinate[:,:,:2]
    decoded = np.where(encoded <= .04045, encoded/12.92, ((encoded+.055)/1.055)**2.4)
    yy, xx = np.mgrid[:coordinate.shape[0],:coordinate.shape[1]]
    target = np.stack((((xx+.5)/coordinate.shape[1]-.5)*frame["frame_width_mm"]/dimensions["width_mm"]+.5, ((yy+.5)/coordinate.shape[0]-.5)*frame["frame_depth_mm"]/dimensions["depth_mm"]+.5),axis=2)
    # Coverage rounded to alpha=255 can still mix edge pixels with transparent
    # black. Compare pixel centers inside the silhouette, away from antialiasing.
    interior = np.asarray(Image.fromarray(np.uint8(coordinate[:,:,3]>.999)*255).filter(ImageFilter.MinFilter(5)))>0
    orientation_error = float(np.abs(decoded[interior]-target[interior]).max()) if interior.any() else 1
    if orientation_error > .015:
        raise ValueError("Ориентация вида сверху не прошла проверку")

    def polygons(geometry):
        tolerance = .75
        for _ in range(15):
            result = v.rings(geometry.simplify(tolerance, preserve_topology=True), dimensions)
            if len(result) <= 32 and all(len(p["outer"]) <= 200 and len(p["holes"]) <= 8 and all(len(h)<=200 for h in p["holes"]) for p in result):
                break
            tolerance *= 1.5
        else:
            raise ValueError("Контур модели слишком сложный")
        # Rounding normalized points must not create self contacts.
        cleaned=[]
        for p in result:
            polygon=Polygon([(q["x"],q["y"]) for q in p["outer"]], [[(q["x"],q["y"]) for q in h] for h in p["holes"]])
            if not polygon.is_valid:
                fixed=polygon.buffer(0)
                if fixed.geom_type != "Polygon" or abs(fixed.area-polygon.area)*dimensions["width_mm"]*dimensions["depth_mm"]>1:
                    raise ValueError("Не удалось построить надёжный контур модели")
                p={"outer":[{"x":x,"y":y} for x,y in list(fixed.exterior.coords)[:-1]], "holes":[[{"x":x,"y":y} for x,y in list(h.coords)[:-1]] for h in fixed.interiors]}
            cleaned.append(p)
        return cleaned

    footprint = polygons(shape)
    volumes=[]
    # Conservative height bands preserve useful space beneath table tops.
    for index in range(8):
        lower, upper = dimensions["height_mm"]*index/8, dimensions["height_mm"]*(index+1)/8
        band=[]
        for mesh in meshes:
            ys=mesh["vertices"][mesh["triangles"],1]
            selected=mesh["triangles"][(ys.min(axis=1)<=upper)&(ys.max(axis=1)>=lower)]
            if len(selected):
                band.append({**mesh,"triangles":selected})
        if band:
            try:
                volumes.append({"min_height_mm":lower,"max_height_mm":upper,"footprints":polygons(v.projection(band))})
            except ValueError:
                volumes.append({"min_height_mm":lower,"max_height_mm":upper,"footprints":footprint})
    for size in (512,256,128):
        copy=image.copy()
        copy.thumbnail((size,size),Image.Resampling.LANCZOS)
        copy.save(folder/f"2d/original/top_view_{size}.webp",quality=90,method=6)
    Image.open(folder/"previews/isometric.png").save(folder/"previews/isometric.webp",quality=90,method=6)
    paths=[]
    for p in footprint:
        commands=" ".join("M "+" L ".join(f'{q["x"]*1000:.3f},{q["y"]*1000:.3f}' for q in ring)+" Z" for ring in [p["outer"],*p["holes"]])
        paths.append(f'<path d="{commands}" fill="#f2f0e8" stroke="#526052" stroke-width="4" fill-rule="evenodd"/>')
    (folder/"2d/technical.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'+"".join(paths)+"</svg>",encoding="utf-8")
    factors=render["scale_factors"]
    distortion=max(factors)/min(factors)
    report={"status":"approved","dimension_error_mm":error,"pivot_error_mm":pivot_error,"silhouette_iou":iou,"orientation_error":orientation_error,"scale_factors":factors,"proportions_changed":distortion>1.2,"shape_accuracy":"AI reconstruction; dimensions supplied by user; conservative collision geometry", "model_sha256":v.sha(model),"source_sha256":None}
    asset={"jobId":job_id,"version":version,"dimensions":dimensions,"frame":frame,"footprints":{"visual":footprint,"collision":footprint,"volumes":volumes},"triangles":triangles,"glbBytes":model.stat().st_size,"modelSha256":v.sha(model)}
    (folder/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    # Derivative hashes make successful completion and later corruption independently inspectable.
    files=[p for name in ("2d","3d","previews") for p in (folder/name).rglob("*") if p.is_file()]
    (folder/"provenance.json").write_text(json.dumps({p.relative_to(folder).as_posix():v.sha(p) for p in files},indent=2),encoding="utf-8")
    return {"asset":asset,"report":report,"reviewed":False}
