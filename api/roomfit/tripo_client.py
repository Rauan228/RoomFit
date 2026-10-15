"""Tripo v3 contract, verified against the official H-series documentation.

Paid task submission is deliberately NOT retried: a lost response is ambiguous.
Downloads use a separate client, without the provider Authorization header.
"""
import ipaddress
import json
import os
import socket
import struct
from pathlib import Path
from urllib.parse import urlsplit
import httpx

BASE_URL = "https://openapi.tripo3d.ai/v3"


class TripoError(Exception):
    def __init__(self, message, *, transient=False, uncertain=False):
        super().__init__(message)
        self.transient = transient
        self.uncertain = uncertain


def inspect_glb(path):
    """Reject external dependencies and unreasonable allocations before Blender opens it."""
    raw = Path(path).read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF":
        raise ValueError("Сервис вернул файл, который не является GLB")
    _, version, length = struct.unpack_from("<III", raw)
    size, kind = struct.unpack_from("<II", raw, 12)
    if version != 2 or length != len(raw) or kind != 0x4E4F534A or size > min(len(raw)-20, 8_000_000):
        raise ValueError("Повреждённый GLB")
    document = json.loads(raw[20:20+size])
    if any(e.get("uri") and not e["uri"].startswith("data:") for name in ("buffers", "images") for e in document.get(name, [])):
        raise ValueError("Модель содержит внешние файлы")
    if document.get("skins") or document.get("animations"):
        raise ValueError("Для мебели нужна статичная модель")
    if sum(a.get("count", 0) for a in document.get("accessors", [])) > 12_000_000:
        raise ValueError("Модель слишком сложная")
    return document


def safe_download_url(url, hosts=None):
    parsed = urlsplit(url)
    # The second host is returned by authenticated v3 task queries in production.
    # Keep exact hosts: never trust arbitrary URLs or wildcard subdomains.
    allowed = hosts or os.getenv("TRIPO_DOWNLOAD_HOSTS", "cdn.tripo3d.ai,tripo-data.rg1.data.tripo3d.com").split(",")
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443) or parsed.hostname not in {h.strip().lower() for h in allowed}:
        raise TripoError("Недопустимый адрес результата Tripo")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError()
    except (OSError, ValueError):
        raise TripoError("Не удалось безопасно получить результат Tripo")
    return url


class TripoClient:
    def __init__(self, key=None, transport=None):
        self.client = httpx.Client(
            base_url=BASE_URL, headers={"Authorization": "Bearer " + (key or os.getenv("TRIPO_API_KEY", ""))},
            timeout=httpx.Timeout(60, connect=15), transport=transport, follow_redirects=False,
        )

    def close(self):
        self.client.close()

    def _request(self, method, path, *, paid=False, **kwargs):
        try:
            response = self.client.request(method, path, **kwargs)
        except httpx.HTTPError:
            raise TripoError("Tripo временно недоступен", transient=not paid, uncertain=paid)
        if response.status_code == 429:
            raise TripoError("Tripo просит подождать перед следующим запросом", transient=not paid)
        if response.status_code >= 500:
            raise TripoError("Tripo временно недоступен", transient=not paid, uncertain=paid)
        if response.status_code in (401, 403):
            raise TripoError("Не удалось авторизоваться в Tripo. Обратись в поддержку RoomFit")
        try:
            payload = response.json()
        except ValueError:
            raise TripoError("Некорректный ответ Tripo", uncertain=paid)
        if not response.is_success or payload.get("code") != 0:
            if payload.get("code") == 2010:
                raise TripoError("У сервиса закончились кредиты для генерации")
            raise TripoError("Tripo не смог выполнить запрос. Проверь фото или попробуй позже")
        if not isinstance(payload.get("data"), dict):
            raise TripoError("Неполный ответ Tripo", uncertain=paid)
        return payload["data"]

    def upload_image(self, path):
        with Path(path).open("rb") as source:
            result = self._request("POST", "/files", files={"file": ("furniture.png", source, "image/png")})
        token = result.get("file_token")
        if not isinstance(token, str) or not token or len(token) > 300:
            raise TripoError("Tripo не подтвердил загрузку фото")
        return token

    def _parameters(self):
        model = os.getenv("TRIPO_MODEL_VERSION", "v3.1-20260211")
        if model not in ("v3.1-20260211", "v3.0-20250812"):
            raise TripoError("Эта версия Tripo ещё не настроена в RoomFit")
        return dict(model=model, texture=True, pbr=True, texture_quality="detailed", geometry_quality="standard", face_limit=50000)

    def create_image_to_model_task(self, token):
        return self._create("/generation/image-to-model", dict(self._parameters(), input=token, enable_image_autofix=False))

    def create_multiview_task(self, views):
        if "front" not in views or not 2 <= len(views) <= 4 or set(views) - {"front", "left", "back", "right"}:
            raise ValueError("Нужны фото спереди и хотя бы с одной другой стороны")
        return self._create("/generation/multiview-to-model", dict(self._parameters(), inputs=[{view: token} for view, token in views.items()]))

    def _create(self, path, body):
        result = self._request("POST", path, json=body, paid=True)
        task = result.get("task_id")
        if not isinstance(task, str) or not task or len(task) > 200 or "/" in task:
            raise TripoError("Tripo не подтвердил создание задачи. Повторная отправка остановлена", uncertain=True)
        return task

    def get_task(self, task_id):
        return self._request("GET", "/tasks/" + task_id)

    def get_balance(self):
        return self._request("GET", "/account/balance")

    def download_model(self, url, destination):
        safe_download_url(url)
        maximum = 100_000_000
        destination = Path(destination)
        temporary = destination.with_suffix(".part")
        try:
            with httpx.Client(timeout=httpx.Timeout(180, connect=15), follow_redirects=False) as download:
                with download.stream("GET", url) as response:
                    if response.status_code != 200:
                        raise TripoError("Не удалось скачать модель. Повторим загрузку", transient=True)
                    if int(response.headers.get("content-length", "0")) > maximum:
                        raise TripoError("Созданная модель слишком большая")
                    size = 0
                    with temporary.open("wb") as output:
                        for chunk in response.iter_bytes():
                            size += len(chunk)
                            if size > maximum:
                                raise TripoError("Созданная модель слишком большая")
                            output.write(chunk)
            inspect_glb(temporary)
            temporary.replace(destination)
        except httpx.HTTPError:
            raise TripoError("Загрузка модели прервалась. Повторим загрузку", transient=True)
        finally:
            temporary.unlink(missing_ok=True)
