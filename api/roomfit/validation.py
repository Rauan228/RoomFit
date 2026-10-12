import base64, json, math, re
from pathlib import Path
from io import BytesIO
from jsonschema import Draft7Validator, FormatChecker
from shapely.geometry import Polygon
from PIL import Image

SCHEMA_PATH = Path(__file__).with_name("project.schema.json")
VALIDATOR = Draft7Validator(
    json.loads(SCHEMA_PATH.read_text(encoding="utf-8")), format_checker=FormatChecker()
)


def validate_document(doc):
    if not SCHEMA_PATH.exists():
        raise ValueError("Схема проекта не установлена")
    errors = list(VALIDATOR.iter_errors(doc))
    if errors:
        raise ValueError(
            "Некорректный проект: " + ".".join(str(p) for p in errors[0].absolute_path)
        )
    floor_ids = {f["id"] for f in doc["floors"]}
    if len(floor_ids) != len(doc["floors"]):
        raise ValueError("Повторяющиеся этажи")
    variant_ids = {v["id"] for v in doc["variants"]}
    if (
        len(variant_ids) != len(doc["variants"])
        or doc["activeVariantId"] not in variant_ids
    ):
        raise ValueError("Некорректный вариант")
    for f in doc["floors"]:
        for collection in [
            "rooms",
            "walls",
            "openings",
            "zones",
            "measurements",
            "annotations",
        ]:
            if len({v["id"] for v in f[collection]}) != len(f[collection]):
                raise ValueError("Повторяющиеся идентификаторы объектов")
        wall_ids = {w["id"] for w in f["walls"]}
        if len(wall_ids) != len(f["walls"]):
            raise ValueError("Повторяющиеся стены")
        for r in f["rooms"]:
            p = Polygon([(p["x"], p["y"]) for p in r["points"]])
            if not p.is_valid or p.area < 1:
                raise ValueError("Контур комнаты должен быть простым и ненулевым")
        for w in f["walls"]:
            if w.get("roomId") and w["roomId"] not in {r["id"] for r in f["rooms"]}:
                raise ValueError("Стена относится к неизвестной комнате")
            if (
                math.hypot(
                    w["end"]["x"] - w["start"]["x"], w["end"]["y"] - w["start"]["y"]
                )
                < 1
            ):
                raise ValueError("Нулевая длина стены")
        for o in f["openings"]:
            w = next((w for w in f["walls"] if w["id"] == o["wallId"]), None)
            if not w:
                raise ValueError("Проём не связан со стеной")
            if (
                o["offset"] + o["width"]
                > math.hypot(
                    w["end"]["x"] - w["start"]["x"], w["end"]["y"] - w["start"]["y"]
                )
                + 0.01
            ):
                raise ValueError("Проём выходит за стену")
        for z in f["zones"]:
            p = Polygon([(p["x"], p["y"]) for p in z["points"]])
            if not p.is_valid or p.area < 1:
                raise ValueError("Некорректная зона")
        if f.get("underlay"):
            media = re.match(
                r"^data:image/(png|jpeg|webp);base64,", f["underlay"]["src"]
            )
            if not media:
                raise ValueError("Недопустимый формат подложки")
            raw = base64.b64decode(f["underlay"]["src"].split(",", 1)[1], validate=True)
            if len(raw) > 4_500_000:
                raise ValueError("Подложка слишком большая")
            try:
                with Image.open(BytesIO(raw)) as image:
                    if (
                        image.format
                        != {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[
                            media.group(1)
                        ]
                    ):
                        raise ValueError("Тип изображения не соответствует файлу")
                    if image.width * image.height > 16_000_000:
                        raise ValueError("Слишком большое изображение")
                    image.verify()
            except Image.DecompressionBombError:
                raise ValueError("Слишком большое изображение")
    for v in doc["variants"]:
        if len({i["id"] for i in v["items"]}) != len(v["items"]):
            raise ValueError("Повторяющиеся предметы")
        for item in v["items"]:
            if item["floorId"] not in floor_ids:
                raise ValueError("Предмет относится к неизвестному этажу")
            if item.get("contour"):
                p = Polygon([(p["x"], p["y"]) for p in item["contour"]])
                if (
                    not p.is_valid
                    or p.area < 0.0001
                    or any(
                        not 0 <= p[k] <= 1 for p in item["contour"] for k in ["x", "y"]
                    )
                ):
                    raise ValueError("Некорректный контур мебели")
    return doc


def validate_catalog(data):
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("name"), str)
        or not 1 <= len(data["name"]) <= 120
    ):
        raise ValueError("Название мебели обязательно")
    for field in ["width", "depth", "height"]:
        n = data.get(field)
        if (
            not isinstance(n, (int, float))
            or not math.isfinite(n)
            or not 0 <= n <= 20000
            or (field != "height" and n < 10)
        ):
            raise ValueError("Некорректные размеры")
    if not isinstance(data.get("type"), str) or not isinstance(
        data.get("category"), str
    ):
        raise ValueError("Тип и категория обязательны")
    if len(data["type"]) > 40 or len(data["category"]) > 80:
        raise ValueError("Слишком длинный тип или категория")
    if not isinstance(data.get("color"), str) or not re.fullmatch(
        r"#[0-9a-fA-F]{6}", data["color"]
    ):
        raise ValueError("Нужен цвет в формате #RRGGBB")
    if (
        not isinstance(data.get("clearance"), (int, float))
        or not math.isfinite(data["clearance"])
        or not 0 <= data["clearance"] <= 3000
    ):
        raise ValueError("Некорректная зона обслуживания")
    if (
        not isinstance(data.get("tags"), list)
        or len(data["tags"]) > 20
        or any(not isinstance(t, str) or len(t) > 80 for t in data["tags"])
    ):
        raise ValueError("Некорректные теги")
    contour = data.get("contour")
    if contour:
        if not isinstance(contour, list) or not 3 <= len(contour) <= 200:
            raise ValueError("Контур должен иметь 3–200 точек")
        p = Polygon([(v["x"], v["y"]) for v in contour])
        if (
            not p.is_valid
            or p.area < 0.0001
            or any(not 0 <= v[k] <= 1 for v in contour for k in ["x", "y"])
        ):
            raise ValueError("Некорректный контур")
    return data
