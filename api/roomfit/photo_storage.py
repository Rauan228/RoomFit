"""Persistent private filesystem storage, served only by authorized API routes.

Fits the existing VPS; independent of web release folders. No public photo URLs.
"""
import io
import os
import shutil
from pathlib import Path
from uuid import UUID
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD = 8_000_000
MIME = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def root():
    path = Path(os.getenv("ROOMFIT_PHOTO_STORAGE", "data/photo-furniture")).resolve()
    path.mkdir(parents=True, exist_ok=True)
    (path / ".roomfit-private-storage").touch(exist_ok=True)
    return path


def job_folder(owner, job):
    # IDs, never supplied filenames, form paths.
    return root() / str(UUID(owner)) / str(UUID(job))


def check_capacity(owner, extra_bytes=0, replacing=()):
    folder = root() / str(UUID(owner))
    excluded = {Path(p).resolve() for p in replacing}
    used = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file() and p.resolve() not in excluded) if folder.exists() else 0
    maximum = int(os.getenv("ROOMFIT_PHOTO_USER_STORAGE_MB", "500")) * 1_000_000
    if used + extra_bytes > maximum:
        raise ValueError("Недостаточно места для личной мебели. Обратись в поддержку")


def remove_job(owner, job):
    base = root()
    target = job_folder(owner, job).resolve()
    if target.parent.parent != base or not (base / ".roomfit-private-storage").is_file():
        raise ValueError("Invalid private job target")
    if target.is_dir():
        shutil.rmtree(target)


def validate_image(raw, mime, crop=None):
    if mime not in MIME or not 1 <= len(raw) <= MAX_UPLOAD:
        raise ValueError("Поддерживаются JPG, PNG и WebP размером до 8 МБ")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format != MIME[mime] or source.width * source.height > 24_000_000 or source.width < 256 or source.height < 256:
                raise ValueError("Фото должно быть не меньше 256 × 256 пикселей и не больше 24 мегапикселей")
            source.verify()
        with Image.open(io.BytesIO(raw)) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
            if crop:
                x, y, w, h = crop
                image = image.crop((round(x*image.width), round(y*image.height), round((x+w)*image.width), round((y+h)*image.height)))
                if min(image.size) < 256:
                    raise ValueError("После обрезки предмет должен занимать хотя бы 256 × 256 пикселей")
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="PNG", optimize=True)
            if len(output.getvalue()) > 20_000_000:
                raise ValueError("Фото слишком сложное. Уменьши разрешение")
            return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError("Не удалось прочитать фото. Выбери другой JPG, PNG или WebP")


def write_image(owner, job, view, raw, normalized):
    if view not in ("front", "left", "back", "right"):
        raise ValueError("Неизвестный ракурс")
    folder = job_folder(owner, job)
    check_capacity(owner, len(raw)+len(normalized), [folder/f"original-{view}.bin", folder/f"input-{view}.png"])
    folder.mkdir(parents=True, exist_ok=True)
    for name, content in [(f"original-{view}.bin",raw),(f"input-{view}.png",normalized)]:
        temporary=folder/(name+".tmp")
        temporary.write_bytes(content)
        temporary.replace(folder/name)


def remove_owner(owner):
    base = root()
    target = (base / str(UUID(owner))).resolve()
    if target.parent != base or not (base / ".roomfit-private-storage").is_file():
        raise ValueError("Invalid private storage target")
    if target.is_dir():
        shutil.rmtree(target)
