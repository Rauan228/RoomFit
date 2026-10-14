import json, shutil
from pathlib import Path
import pytest
from PIL import Image, ImageOps
from pipeline import folder_for, load_specs, assert_immutable, write_export_provenance
from validation import validate
from validation import read_glb
from validation import geometry
import numpy as np
from shapely.geometry import Polygon
import struct


@pytest.fixture
def sofa_copy(tmp_path):
    spec = next(s for s in load_specs() if s["asset_id"] == "sofa")
    source = folder_for(spec)
    if not source.exists():
        pytest.fail("Generate the canonical pilot sofa before running consistency tests")
    spec = json.loads((source / "source/specification.json").read_text(encoding="utf-8"))
    for directory in ("3d", "2d", "source", "validation"):
        shutil.copytree(source / directory, tmp_path / directory)
    shutil.copy2(source / "render-info.json", tmp_path / "render-info.json")
    return spec, tmp_path


def test_real_export_matches_geometry_materials_and_all_rotations(sofa_copy):
    spec, folder = sofa_copy
    report, footprints = validate(spec, folder)
    assert report["status"] == "approved"
    assert all(check is True for check in report["checks"].values())
    assert report["dimension_error_mm"] < 1
    assert [r["angle"] for r in report["rotations"]] == [0, 45, 90, 180, 270]
    assert footprints["visual"] and footprints["collision"] and footprints["volumes"]


def test_upholstery_transports_albedo_normal_roughness_and_restrained_sheen_to_glb(sofa_copy):
    _, folder = sofa_copy
    document, _ = read_glb(folder / "3d/model.glb")
    primary = next(m for m in document["materials"] if m.get("extras", {}).get("slot") == "primary")
    assert "baseColorTexture" in primary["pbrMetallicRoughness"]
    assert "metallicRoughnessTexture" in primary["pbrMetallicRoughness"]
    assert "normalTexture" in primary
    assert max(primary["extensions"]["KHR_materials_sheen"]["sheenColorFactor"]) < .3
    assert all("bufferView" in image and "uri" not in image for image in document["images"])


def test_splayed_chair_legs_use_physical_vertices_for_dimensions_and_floor_contact():
    spec = next(s for s in load_specs() if s["asset_id"] == "chair")
    folder = folder_for(spec)
    _, meshes = geometry(folder / "3d/model.glb")
    points = np.concatenate([m["vertices"] for m in meshes])
    dims = spec["dimensions"]
    assert np.allclose(points.max(axis=0) - points.min(axis=0), [dims["width_mm"], dims["height_mm"], dims["depth_mm"]], atol=1)
    assert abs(points[:, 1].min()) < 1


def test_published_normalized_contours_are_simple_and_can_be_saved_by_the_api():
    manifest = json.loads((Path(__file__).resolve().parents[1] / "packages/core/src/asset-manifest.json").read_text(encoding="utf-8"))
    assert len(manifest) == 26
    for asset in manifest.values():
        shapes = asset["footprints"]["visual"] + asset["footprints"]["collision"]
        shapes += [p for v in asset["footprints"]["volumes"] for p in v["footprints"]]
        for contour in shapes:
            polygon = Polygon([(p["x"], p["y"]) for p in contour["outer"]], [[(p["x"], p["y"]) for p in hole] for hole in contour["holes"]])
            assert polygon.is_valid, asset["asset_id"]
            assert polygon.area > 0, asset["asset_id"]


def test_modified_runtime_webp_cannot_be_republished(sofa_copy):
    spec, folder = sofa_copy
    report, _ = validate(spec, folder)
    write_export_provenance(folder)
    path = folder / "2d/original/top_view_512.webp"
    path.write_bytes(b"modified runtime picture")
    with pytest.raises(RuntimeError, match="output was modified"):
        assert_immutable(folder, report)


def test_mirrored_coordinate_render_cannot_be_approved(sofa_copy):
    spec, folder = sofa_copy
    path = folder / "validation/coordinates.png"
    ImageOps.mirror(Image.open(path)).save(path)
    report, _ = validate(spec, folder)
    assert report["status"] == "rejected"
    assert not report["checks"]["orientation_not_mirrored"]


def test_changed_2d_silhouette_cannot_be_approved(sofa_copy):
    spec, folder = sofa_copy
    path = folder / "2d/original/top_view_1024.png"
    image = Image.open(path).convert("RGBA")
    image.paste((0, 0, 0, 0), (0, 0, image.width//2, image.height))
    image.save(path)
    report, _ = validate(spec, folder)
    assert report["status"] == "rejected"
    assert not report["checks"]["silhouettes"]


def test_tampered_colour_image_cannot_be_approved_even_with_same_alpha(sofa_copy):
    spec, folder = sofa_copy
    path = folder / "2d/original/top_view_1024.png"
    image = Image.open(path).convert("RGBA")
    image.putalpha(image.getchannel("A"))
    colour = Image.new("RGBA", image.size, "#ff00ff")
    colour.putalpha(image.getchannel("A"))
    colour.save(path)
    report, _ = validate(spec, folder)
    assert report["status"] == "rejected"
    assert not report["checks"]["renderer_provenance"]


def test_wrong_physical_dimensions_cannot_be_approved(sofa_copy):
    spec, folder = sofa_copy
    spec["dimensions"]["width_mm"] += 100
    report, _ = validate(spec, folder)
    assert report["status"] == "rejected"
    assert not report["checks"]["dimensions"]


def test_detached_structural_part_cannot_be_approved(sofa_copy):
    spec, folder = sofa_copy
    path = folder / "3d/model.glb"
    document, binary = read_glb(path)
    leg = next(node for node in document["nodes"] if node.get("name", "").startswith("leg_"))
    leg.setdefault("translation", [0, 0, 0])[1] += 1
    data = json.dumps(document).encode()
    data += b" " * ((4-len(data)%4)%4)
    binary += b"\x00" * ((4-len(binary)%4)%4)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12+8+len(data)+8+len(binary)) + struct.pack("<II",len(data),0x4E4F534A) + data + struct.pack("<II",len(binary),0x004E4942) + binary)
    report, _ = validate(spec, folder)
    assert report["status"] == "rejected"
    assert not report["checks"]["structural_parts_connected"]
