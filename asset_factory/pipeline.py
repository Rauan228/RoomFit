"""RoomFit Asset Factory CLI: generate -> validate -> approve -> publish."""
import argparse, hashlib, json, math, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from validation import validate, sha
from jsonschema import validate as validate_schema
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[1]
FACTORY = Path(__file__).resolve().parent
OUTPUT = ROOT / "assets/furniture"
PILOT = ["sofa", "bed-double", "table", "wardrobe", "armchair", "sofa-corner", "wall-shelf"]


def load_specs():
    return json.loads((FACTORY / "specifications.json").read_text(encoding="utf-8"))


def version(spec):
    inputs = json.dumps(spec, sort_keys=True).encode() + (FACTORY / "blender_generate.py").read_text(encoding="utf-8").encode() + (FACTORY / "validation.py").read_text(encoding="utf-8").encode()
    if spec.get("generator") == "appliance":
        inputs += (FACTORY / "blender_appliances.py").read_text(encoding="utf-8").encode()
    if spec.get("generator") in ("interior", "interior-lamp", "interior-appliance"):
        inputs += (FACTORY / "blender_interiors.py").read_text(encoding="utf-8").encode()
    if spec.get("generator") == "interior-lamp":
        inputs += (FACTORY / "blender_floor_lamp.py").read_text(encoding="utf-8").encode()
    if spec.get("generator") == "interior-appliance":
        inputs += (FACTORY / "blender_appliance_interiors.py").read_text(encoding="utf-8").encode()
    return "v1-" + hashlib.sha256(inputs).hexdigest()[:12]


def folder_for(spec):
    return OUTPUT / spec["category"] / spec["asset_id"] / version(spec)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def write_export_provenance(folder):
    files = [p for name in ("2d", "3d", "previews") for p in (folder / name).rglob("*") if p.is_file()]
    files += [folder / "comparison.jpg", folder / "source/model.blend"]
    write_json(folder / "source/export-provenance.json", {"files": {p.relative_to(folder).as_posix(): sha(p) for p in files if p.exists()}})


def assert_immutable(folder, report):
    if report["model_sha256"] != sha(folder / "3d/model.glb"):
        raise RuntimeError("Approved GLB was modified: " + str(folder))
    for name in ("render-provenance.json", "export-provenance.json"):
        path = folder / "source" / name
        if not path.exists():
            raise RuntimeError("Run consistency validation before publication: missing " + name)
        provenance = json.loads(path.read_text())
        if not provenance.get("files") or any(not (folder / file).is_file() or sha(folder / file) != digest for file, digest in provenance["files"].items()):
            raise RuntimeError("Approved asset output was modified: " + str(folder))


def normalize_encoded_footprints(footprints, dimensions):
    """Remove zero-width contacts introduced by rounding/clamping normalized coordinates."""
    def repair(polygons):
        result=[]
        for polygon in polygons:
            source=Polygon([(p["x"],p["y"]) for p in polygon["outer"]], [[(p["x"],p["y"]) for p in hole] for hole in polygon["holes"]])
            if source.is_valid:
                result.append(polygon)
                continue
            fixed=source.buffer(0)
            if fixed.is_empty or abs(fixed.area-source.area)*dimensions["width_mm"]*dimensions["depth_mm"]>1:
                raise RuntimeError("Normalized footprint requires a substantive geometry repair")
            parts=[fixed] if fixed.geom_type=="Polygon" else list(fixed.geoms)
            for part in parts:
                result.append({"outer":[{"x":x,"y":y} for x,y in list(part.exterior.coords)[:-1]], "holes":[[{"x":x,"y":y} for x,y in list(hole.coords)[:-1]] for hole in part.interiors]})
        return result
    for name in ("visual","collision","technical_features"):
        footprints[name]=repair(footprints[name])
    for volume in footprints["volumes"]:
        volume["footprints"]=repair(volume["footprints"])
    return footprints


def font(size):
    for path in (Path("C:/Windows/Fonts/arial.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def comparison(spec, folder, report):
    sheet = Image.new("RGB", (1200, 770), "#f5f3ed")
    draw = ImageDraw.Draw(sheet)
    for path, x in [(folder / "2d/original/top_view_1024.png", 30), (folder / "previews/isometric.webp", 630)]:
        image = Image.open(path).convert("RGBA")
        image.thumbnail((540, 540))
        sheet.paste(image, (x + (540-image.width)//2, 40+(540-image.height)//2), image)
    draw.text((40, 590), spec["name"], fill="#344439", font=font(30))
    d = spec["dimensions"]
    lines = [f'{d["width_mm"]} × {d["depth_mm"]} × {d["height_mm"]} mm · {spec["category"]}', f'{report["triangles"]:,} triangles · GLB {report["glb_bytes"] / 1024:.1f} KB · {report["status"].upper()}', f'{spec["asset_id"]} · {spec["generation_version"]} · silhouette IoU {min(v["silhouette_iou"] for v in report["variants"]):.4f}']
    for index, line in enumerate(lines):
        draw.text((40, 635+index*33), line, fill="#53664c", font=font(22))
    sheet.save(folder / "comparison.jpg", quality=90)


def technical(footprints, path):
    def commands(polygon):
        contours = [polygon["outer"], *polygon["holes"]]
        return " ".join("M " + " L ".join(f'{p["x"]*1000:.3f} {p["y"]*1000:.3f}' for p in ring) + " Z" for ring in contours)
    paths = [f'<path d="{commands(p)}" fill="#f2f0e8" fill-rule="evenodd" stroke="#526052" stroke-width="5"/>' for p in footprints["collision"]]
    paths += [f'<path d="{commands(p)}" fill="none" stroke="#7f8b7c" stroke-width="3"/>' for p in footprints["technical_features"]]
    path.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' + "".join(paths) + '</svg>', encoding="utf-8")


def build(spec, blender, force=False):
    folder = folder_for(spec)
    spec = {**spec, "generation_version": version(spec)}
    report_path = folder / "validation.json"
    if report_path.exists() and not force:
        report = json.loads(report_path.read_text())
        if report["status"] == "approved":
            assert_immutable(folder, report)
            print("Cached approved: " + spec["asset_id"], flush=True)
            return report
    if report_path.exists() and force and json.loads(report_path.read_text())["status"] == "approved":
        raise RuntimeError("Approved versions are immutable; change the specification or generator to create a new version")
    for directory in ("source", "3d", "2d", "previews"):
        (folder / directory).mkdir(parents=True, exist_ok=True)
    write_json(folder / "source/specification.json", spec)
    print("Generate: " + spec["asset_id"] + " / " + spec["generation_version"], flush=True)
    with (folder / "generation.log").open("w", encoding="utf-8") as log:
        if spec.get("generator") not in (None, "appliance", "interior", "interior-lamp", "interior-appliance"):
            raise ValueError("Unsupported geometry generator")
        generator = {"appliance": "blender_appliances.py", "interior": "blender_interiors.py", "interior-lamp": "blender_floor_lamp.py", "interior-appliance": "blender_appliance_interiors.py"}.get(spec.get("generator"), "blender_generate.py")
        command = [str(blender), "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(FACTORY / generator), "--", str(folder / "source/specification.json"), str(folder)]
        device = os.getenv("ROOMFIT_CYCLES_DEVICE", "CPU")
        if device not in {"CPU", "CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"}:
            raise ValueError("Unsupported Cycles device")
        command += ["--cycles-device", device]
        run = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    if run.returncode:
        raise RuntimeError(f'Blender failed for {spec["asset_id"]}; inspect {folder / "generation.log"}')
    source_files = [folder / "3d/model.glb", folder / "validation/coordinates.png", *[folder / "2d" / v["id"] / "top_view_1024.png" for v in spec["material_variants"]]]
    write_json(folder / "source/render-provenance.json", {"asset_id": spec["asset_id"], "generation_version": spec["generation_version"], "files": {p.relative_to(folder).as_posix(): sha(p) for p in source_files}})
    for variant in spec["material_variants"]:
        original = Image.open(folder / "2d" / variant["id"] / "top_view_1024.png").convert("RGBA")
        for size in (512, 256, 128):
            copy = original.copy()
            copy.thumbnail((size, size), Image.Resampling.LANCZOS)
            copy.save(folder / "2d" / variant["id"] / f"top_view_{size}.webp", quality=88, method=6)
    for view in ("front", "side", "isometric"):
        Image.open(folder / "previews" / f"{view}.png").save(folder / "previews" / f"{view}.webp", quality=90, method=6)
    print("Validate: " + spec["asset_id"], flush=True)
    report, footprints = validate(spec, folder)
    if spec.get("repair_normalized_footprints"):
        footprints=normalize_encoded_footprints(footprints,spec["dimensions"])
    write_json(report_path, report)
    frames = json.loads((folder / "render-info.json").read_text())
    metadata = {**spec, "assets": {"model_3d": "3d/model.glb", "top_2d": "2d/original/top_view_512.webp", "technical_2d": "2d/technical.svg", "preview": "previews/isometric.webp", "comparison": "comparison.jpg"}, "top_frame_mm": frames["original"], "footprints": footprints, "validation_status": report["status"], "triangles": report["triangles"], "glb_bytes": report["glb_bytes"], "material_variants": [{**v, "top_2d": f'2d/{v["id"]}/top_view_512.webp', "top_128": f'2d/{v["id"]}/top_view_128.webp', "top_256": f'2d/{v["id"]}/top_view_256.webp'} for v in spec["material_variants"]]}
    technical(footprints, folder / "2d/technical.svg")
    validate_schema(metadata, json.loads((FACTORY / "asset.schema.json").read_text()))
    write_json(folder / "metadata.json", metadata)
    comparison(spec, folder, report)
    print(f'{spec["asset_id"]}: {report["status"]}, {report["triangles"]} triangles, {report["glb_bytes"] // 1024} KB, IoU {min(v["silhouette_iou"] for v in report["variants"]):.4f}', flush=True)
    if report["status"] != "approved":
        raise RuntimeError("Consistency validation rejected " + spec["asset_id"] + ": " + json.dumps(report["checks"]))
    write_export_provenance(folder)
    return report


def publish(specs):
    manifest = {}
    archived = {}
    for path in OUTPUT.glob("*/*/*/metadata.json"):
        meta = json.loads(path.read_text(encoding="utf-8"))
        report_path = path.parent / "validation.json"
        if meta["validation_status"] != "approved" or not report_path.exists():
            continue
        report = json.loads(report_path.read_text())
        assert_immutable(path.parent, report)
        meta["base_url"] = "/assets/furniture/" + path.parent.relative_to(OUTPUT).as_posix() + "/"
        archived[f'{meta["asset_id"]}@{meta["generation_version"]}'] = meta
    for spec in specs:
        folder = folder_for(spec)
        if not (folder / "validation.json").exists():
            continue
        report = json.loads((folder / "validation.json").read_text())
        if report["status"] != "approved":
            continue
        assert_immutable(folder, report)
        meta = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        validate_schema(meta, json.loads((FACTORY / "asset.schema.json").read_text()))
        public_root = ROOT / "platform/public/assets/furniture" / folder.relative_to(OUTPUT)
        public_root.mkdir(parents=True, exist_ok=True)
        for name in ("2d", "3d", "previews"):
            shutil.copytree(folder / name, public_root / name, dirs_exist_ok=True)
        for name in ("metadata.json", "validation.json", "comparison.jpg"):
            shutil.copy2(folder / name, public_root / name)
        prefix = "/assets/furniture/" + folder.relative_to(OUTPUT).as_posix() + "/"
        meta["base_url"] = prefix
        manifest[spec["asset_id"]] = meta
    for path in (ROOT / "packages/core/src/asset-manifest.json", ROOT / "api/roomfit/asset-manifest.json", ROOT / "platform/public/assets/furniture/manifest.json"):
        write_json(path, manifest)
    write_json(ROOT / "packages/core/src/asset-versions.json", archived)
    write_json(ROOT / "api/roomfit/asset-versions.json", archived)
    for category in sorted({v["category"] for v in manifest.values()}):
        entries = [v for v in manifest.values() if v["category"] == category]
        sheet = Image.new("RGB", (1200, math.ceil(len(entries) / 3) * 360), "#f5f3ed")
        draw = ImageDraw.Draw(sheet)
        for i, meta in enumerate(entries):
            source = ROOT / "platform/public" / meta["base_url"].lstrip("/") / meta["assets"]["preview"]
            image = Image.open(source).convert("RGBA")
            image.thumbnail((360, 275))
            x, y = (i % 3) * 400 + 20, (i // 3) * 360
            sheet.paste(image, (x+(360-image.width)//2, y+10+(275-image.height)//2), image)
            draw.text((x, y+295), meta["name"], font=font(20), fill="#344439")
            draw.text((x, y+325), meta["asset_id"] + " · approved", font=font(15), fill="#657359")
        sheet.save(ROOT / "platform/public/assets/furniture" / f"contact-{category}.jpg", quality=90)
    import html
    cards = "".join(f'<article><a href="{m["base_url"]}comparison.jpg"><img loading="lazy" src="{m["base_url"]}comparison.jpg" alt="{html.escape(m["name"])}: 2D и 3D"/></a><h2>{html.escape(m["name"])}</h2><p>{m["asset_id"]} · {m["triangles"]:,} треугольников · {m["glb_bytes"] // 1024} КБ · approved</p><a href="{m["base_url"]}validation.json">Проверка</a> · <a href="{m["base_url"]}metadata.json">Метаданные</a> · <a href="{m["base_url"]}3d/model.glb">GLB</a></article>' for m in manifest.values())
    gallery = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>RoomFit Asset Factory — проверенный каталог</title><style>body{font:15px system-ui;background:#f5f3ed;color:#344439;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:24px}article{background:white;border-radius:16px;padding:16px}img{width:100%;border-radius:10px}h2{font-size:20px}a{color:#526843}</style><h1>RoomFit Asset Factory</h1><p>Один источник геометрии: ортографический 2D и GLB. Размеры в мм; передняя сторона +Z; точка привязки — центр основания.</p><main>' + cards + '</main></html>'
    (ROOT / "platform/public/assets/furniture/index.html").write_text(gallery, encoding="utf-8")
    print(f"Published {len(manifest)} approved synchronized assets.", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["generate", "validate", "publish", "approve-pilot"])
    parser.add_argument("--phase", choices=["pilot", "all"], default="pilot")
    parser.add_argument("--asset")
    parser.add_argument("--blender", default=os.getenv("ROOMFIT_BLENDER", str(ROOT / ".local/tools/blender-4.5.14-windows-x64/blender.exe")))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    specs = load_specs()
    selected = [s for s in specs if s["asset_id"] == args.asset] if args.asset else specs if args.phase == "all" else [s for s in specs if s["asset_id"] in PILOT]
    if args.command == "approve-pilot":
        for mode in ("desktop", "mobile"):
            proof = json.loads((ROOT / "artifacts" / f"asset-factory-pilot-{mode}.json").read_text())
            tested = {item["id"]: item["generation_version"] for item in proof["assets"]}
            if proof["status"] != "approved" or any(tested.get(spec["asset_id"]) != version(spec) for spec in specs if spec["asset_id"] in PILOT):
                raise RuntimeError("Pilot synchronization/persistence proof is missing or outdated")
        write_json(OUTPUT / "pilot-validation.json", {"status": "approved", "assets": {spec["asset_id"]: version(spec) for spec in specs if spec["asset_id"] in PILOT}, "browser_modes": ["desktop", "mobile"], "cycle": "specification -> Blender -> GLB/top -> consistency -> editor -> materials -> save/reopen -> export"})
        print("Seven pilot assets passed geometry and complete desktop/mobile integration. Bulk generation enabled.", flush=True)
        return
    if args.phase == "all" and args.command == "generate":
        proof_path = OUTPUT / "pilot-validation.json"
        if not proof_path.exists() or json.loads(proof_path.read_text())["assets"] != {spec["asset_id"]: version(spec) for spec in specs if spec["asset_id"] in PILOT}:
            raise RuntimeError("Run complete pilot browser tests and approve-pilot before bulk generation")
        for spec in [s for s in specs if s["asset_id"] in PILOT]:
            report_path = folder_for(spec) / "validation.json"
            if not report_path.exists() or json.loads(report_path.read_text())["status"] != "approved":
                raise RuntimeError("Bulk generation is gated by the seven validated pilot assets")
    if args.command == "generate":
        for spec in selected:
            build(spec, Path(args.blender), args.force)
    elif args.command == "validate":
        for spec in selected:
            folder = folder_for(spec)
            full_spec = json.loads((folder / "source/specification.json").read_text(encoding="utf-8"))
            report, _ = validate(full_spec, folder)
            if report["status"] != "approved":
                raise RuntimeError("Validation failed: " + spec["asset_id"])
            if (folder / "source/export-provenance.json").exists():
                assert_immutable(folder, report)
            else:
                write_export_provenance(folder)
            print(spec["asset_id"] + ": approved", flush=True)
    if args.command in ("publish", "generate"):
        publish(specs)


if __name__ == "__main__":
    main()
