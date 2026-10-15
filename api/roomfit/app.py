import os, json, hashlib, secrets, hmac, time, smtplib, threading
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select, delete, update, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .database import (
    Base,
    engine,
    SessionLocal,
    User,
    Session,
    Project,
    Revision,
    Share,
    PersonalFurniture,
    Catalog,
    ResetToken,
    Audit,
    Setting,
    Template,
    SupportTicket,
    now,
)
from .validation import validate_document, validate_catalog
from .photo_models import PhotoJob
from .photo_routes import install_photo_routes, validate_references, validate_reference

PRODUCTION = os.getenv("APP_ENV") == "production"
SECRET = os.getenv("SECRET_KEY") or secrets.token_urlsafe(48)
SECURE = os.getenv("COOKIE_SECURE", "true" if PRODUCTION else "false").lower() == "true"
if PRODUCTION and (
    not os.getenv("SECRET_KEY")
    or len(SECRET) < 32
    or not SECURE
    or not str(engine.url).startswith("postgresql")
):
    raise RuntimeError("Production requires PostgreSQL, secure cookies and SECRET_KEY")


class BoundedHasher:
    def __init__(self):
        self.impl = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
        self.slots = threading.Semaphore(2)

    def hash(self, value):
        with self.slots:
            return self.impl.hash(value)

    def verify(self, hash, value):
        with self.slots:
            return self.impl.verify(hash, value)


hasher = BoundedHasher()
DUMMY = hasher.hash(secrets.token_urlsafe(32))
limits = defaultdict(deque)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def signed_csrf():
    nonce = secrets.token_urlsafe(24)
    return (
        nonce
        + "."
        + hmac.new(SECRET.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    )


def valid_csrf(token):
    try:
        nonce, mac = token.split(".", 1)
        return hmac.compare_digest(
            mac, hmac.new(SECRET.encode(), nonce.encode(), hashlib.sha256).hexdigest()
        )
    except (ValueError, AttributeError):
        return False


def cookie(response, name, value, age):
    response.set_cookie(
        name,
        value,
        max_age=age,
        httponly=True,
        secure=SECURE,
        samesite="lax",
        path="/api",
    )


def db():
    with SessionLocal() as session:
        yield session


def public_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "preferences": user.preferences,
    }


def require_user(request: Request, session: DBSession = Depends(db)):
    token = request.cookies.get("roomfit_session", "")
    record = session.get(Session, digest(token)) if token else None
    user = (
        session.get(User, record.user_id)
        if record and record.expires_at > now()
        else None
    )
    if not user or not user.enabled:
        raise HTTPException(401, "Нужно войти в аккаунт")
    return user


def admin(user: User = Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(403, "Нужны права администратора")
    return user


def owned(session, user, project_id, deleted=False):
    project = session.get(Project, project_id)
    if (
        not project
        or project.owner_id != user.id
        or (project.deleted_at is not None and not deleted)
    ):
        raise HTTPException(404, "Проект не найден")
    return project


def project_view(p, document=True):
    result = {
        "id": p.id,
        "name": p.name,
        "version": p.version,
        "favorite": p.favorite,
        "archived": p.archived,
        "deletedAt": p.deleted_at.isoformat() if p.deleted_at else None,
        "updatedAt": p.updated_at.isoformat() + "Z",
    }
    if document:
        result["document"] = p.document
    return result


def revision(session, p):
    session.add(Revision(project_id=p.id, version=p.version, document=p.document))
    old = session.scalars(
        select(Revision)
        .where(Revision.project_id == p.id)
        .order_by(Revision.version.desc())
        .offset(29)
    ).all()
    for r in old:
        session.delete(r)


def login_session(response, user, session):
    token = secrets.token_urlsafe(48)
    session.add(
        Session(
            token=digest(token), user_id=user.id, expires_at=now() + timedelta(days=14)
        )
    )
    session.commit()
    cookie(response, "roomfit_session", token, 14 * 86400)
    return {"user": public_user(user)}


def checked_document(document, owner=None, session=None):
    try:
        validate_references(document, session, owner)
        return validate_document(document)
    except (ValueError, KeyError, TypeError, OSError) as error:
        raise HTTPException(422, "Некорректный проект: " + str(error))


def checked_catalog(data, owner=None, session=None):
    try:
        validate_reference(data, session, owner)
        return validate_catalog(data)
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error))


@asynccontextmanager
async def lifespan(app):
    if not PRODUCTION:
        Base.metadata.create_all(engine)
    with SessionLocal() as session:
        if not session.scalar(select(func.count()).select_from(Catalog)):
            catalog_file = Path(__file__).with_name("catalog.json")
            if catalog_file.exists():
                for item in json.loads(catalog_file.read_text(encoding="utf-8")):
                    session.add(Catalog(id=item["id"], data=item))
                session.commit()
        if not session.scalar(select(func.count()).select_from(Template)):
            template_file = Path(__file__).with_name("templates.json")
            if template_file.exists():
                for t in json.loads(template_file.read_text(encoding="utf-8")):
                    session.add(
                        Template(
                            id=t["id"],
                            name=t["name"],
                            document=checked_document(t["document"]),
                        )
                    )
                session.commit()
    yield


app = FastAPI(
    title="RoomFit API",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "ALLOWED_ORIGINS", "http://127.0.0.1:4181,http://localhost:4181"
    ).split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
install_photo_routes(app, require_user, db)


@app.middleware("http")
async def guard(request, call_next):
    if int(request.headers.get("content-length", "0")) > 8_000_000:
        return JSONResponse({"detail": "Проект слишком большой"}, 413)
    auth = request.url.path.startswith("/api/auth/") and request.method == "POST"
    key = (
        request.client.host if request.client else "unknown",
        "auth" if auth else "api",
    )
    q = limits[key]
    cutoff = time.monotonic() - 60
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= (12 if auth else 500):
        return JSONResponse({"detail": "Слишком много запросов. Подожди минуту."}, 429)
    q.append(time.monotonic())
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        csrf = request.cookies.get("roomfit_csrf", "")
        if not valid_csrf(csrf) or not hmac.compare_digest(
            request.headers.get("x-csrf-token", ""), csrf
        ):
            return JSONResponse(
                {"detail": "Обнови страницу: защитный токен истёк"}, 403
            )
        media_type = request.headers.get("content-type", "").split(";")[0]
        photo_upload = request.method == "PUT" and request.url.path.startswith("/api/photo-furniture/jobs/") and "/images/" in request.url.path
        if media_type != "application/json" and not (photo_upload and media_type in ("image/png", "image/jpeg", "image/webp")):
            return JSONResponse({"detail": "Требуется JSON"}, 415)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return JSONResponse(
        {
            "detail": "Проверь заполнение полей",
            "fields": [
                {"field": ".".join(map(str, e["loc"])), "message": e["msg"]}
                for e in exc.errors()
            ],
        },
        422,
    )


@app.exception_handler(IntegrityError)
async def integrity(request, exc):
    return JSONResponse({"detail": "Запись уже существует или была изменена"}, 409)


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class Registration(Login):
    name: str = Field(min_length=2, max_length=120)


class Profile(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    preferences: dict = Field(default_factory=dict)


class ChangePassword(BaseModel):
    currentPassword: str = Field(max_length=128)
    password: str = Field(min_length=10, max_length=128)


class ConfirmPassword(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)


class Forgot(BaseModel):
    email: EmailStr


class Reset(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class ProjectWrite(BaseModel):
    document: dict
    version: int = Field(ge=1)


class ProjectCreate(BaseModel):
    document: dict


class ProjectMeta(BaseModel):
    version: int | None = Field(default=None, ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    favorite: bool | None = None
    archived: bool | None = None


class AdminUser(BaseModel):
    enabled: bool


@app.get("/api/health")
def health(session: DBSession = Depends(db)):
    session.execute(select(1))
    return {"status": "ok", "service": "roomfit", "schemaVersion": 1}


@app.get("/api/auth/me")
def me(request: Request, response: Response, session: DBSession = Depends(db)):
    csrf = request.cookies.get("roomfit_csrf", "")
    if not valid_csrf(csrf):
        csrf = signed_csrf()
        cookie(response, "roomfit_csrf", csrf, 14 * 86400)
    try:
        user = require_user(request, session)
    except HTTPException:
        user = None
    return {
        "user": public_user(user) if user else None,
        "csrf": csrf,
        "passwordResetAvailable": bool(os.getenv("SMTP_HOST")),
    }


@app.post("/api/auth/register", status_code=201)
def register(data: Registration, response: Response, session: DBSession = Depends(db)):
    email = str(data.email).strip().lower()
    if session.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Этот email уже зарегистрирован")
    if len(data.name.strip()) < 2:
        raise HTTPException(422, "Имя должно содержать хотя бы два символа")
    user = User(
        email=email, name=data.name.strip(), password=hasher.hash(data.password)
    )
    session.add(user)
    session.flush()
    return login_session(response, user, session)


@app.post("/api/auth/login")
def login(data: Login, response: Response, session: DBSession = Depends(db)):
    user = session.scalar(select(User).where(User.email == str(data.email).lower()))
    try:
        ok = hasher.verify(user.password if user else DUMMY, data.password)
    except VerificationError:
        ok = False
    if not user or not ok or not user.enabled:
        raise HTTPException(401, "Неверный email или пароль")
    return login_session(response, user, session)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, session: DBSession = Depends(db)):
    session.execute(
        delete(Session).where(
            Session.token == digest(request.cookies.get("roomfit_session", ""))
        )
    )
    session.commit()
    response.delete_cookie("roomfit_session", path="/api")
    return {"ok": True}


@app.put("/api/profile")
def profile(
    data: Profile, user: User = Depends(require_user), session: DBSession = Depends(db)
):
    if len(data.name.strip()) < 2:
        raise HTTPException(422, "Имя должно содержать хотя бы два символа")
    if len(json.dumps(data.preferences)) > 2000:
        raise HTTPException(422, "Слишком много настроек")
    user.name = data.name.strip()
    user.preferences = data.preferences
    session.commit()
    return public_user(user)


@app.post("/api/auth/password")
def password(
    data: ChangePassword,
    request: Request,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    try:
        hasher.verify(user.password, data.currentPassword)
    except VerificationError:
        raise HTTPException(400, "Текущий пароль неверен")
    user.password = hasher.hash(data.password)
    session.execute(
        delete(Session).where(
            Session.user_id == user.id,
            Session.token != digest(request.cookies.get("roomfit_session", "")),
        )
    )
    session.commit()
    return {"ok": True}


def send_reset(email, token):
    message = EmailMessage()
    message["Subject"] = "Восстановление доступа к RoomFit"
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = email
    message.set_content(
        f"Ссылка действует 30 минут: {os.getenv('FRONTEND_URL', 'http://127.0.0.1:4181')}/reset?token={token}"
    )
    with smtplib.SMTP(
        os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=15
    ) as smtp:
        smtp.starttls()
        if os.getenv("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


@app.post("/api/auth/forgot")
def forgot(data: Forgot, session: DBSession = Depends(db)):
    if not os.getenv("SMTP_HOST"):
        raise HTTPException(
            503, "Почта восстановления пока не настроена администратором"
        )
    user = session.scalar(select(User).where(User.email == str(data.email).lower()))
    if user:
        token = secrets.token_urlsafe(40)
        session.add(
            ResetToken(
                token=digest(token),
                user_id=user.id,
                expires_at=now() + timedelta(minutes=30),
            )
        )
        try:
            send_reset(user.email, token)
        except (OSError, smtplib.SMTPException):
            raise HTTPException(503, "Не удалось отправить письмо. Попробуй позже.")
        session.commit()
    return {"message": "Если аккаунт существует, мы отправили письмо"}


@app.post("/api/auth/reset")
def reset(data: Reset, session: DBSession = Depends(db)):
    token = session.get(ResetToken, digest(data.token))
    if not token or token.expires_at < now():
        raise HTTPException(400, "Ссылка недействительна или истекла")
    user = session.get(User, token.user_id)
    user.password = hasher.hash(data.password)
    session.execute(delete(Session).where(Session.user_id == user.id))
    session.execute(delete(ResetToken).where(ResetToken.user_id == user.id))
    session.commit()
    return {"ok": True}


@app.delete("/api/profile")
def delete_account(
    data: ConfirmPassword,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    try:
        hasher.verify(user.password, data.currentPassword)
    except VerificationError:
        raise HTTPException(400, "Текущий пароль неверен")
    ids = list(session.scalars(select(Project.id).where(Project.owner_id == user.id)))
    for table in [Share, Revision]:
        session.execute(delete(table).where(table.project_id.in_(ids)))
    session.execute(delete(Project).where(Project.owner_id == user.id))
    session.execute(
        delete(PersonalFurniture).where(PersonalFurniture.owner_id == user.id)
    )
    session.execute(delete(Session).where(Session.user_id == user.id))
    session.execute(delete(ResetToken).where(ResetToken.user_id == user.id))
    session.execute(delete(SupportTicket).where(SupportTicket.owner_id == user.id))
    session.execute(delete(PhotoJob).where(PhotoJob.owner_id == user.id))
    session.delete(user)
    session.commit()
    from .photo_storage import remove_owner
    remove_owner(user.id)
    return {"ok": True}


@app.get("/api/projects")
def projects(
    state: str = "active",
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    q = select(Project).where(Project.owner_id == user.id)
    if state == "trash":
        q = q.where(Project.deleted_at > now() - timedelta(days=30))
    else:
        q = q.where(
            Project.deleted_at.is_(None), Project.archived == (state == "archive")
        )
    return [
        project_view(p) for p in session.scalars(q.order_by(Project.updated_at.desc()))
    ]


@app.post("/api/projects", status_code=201)
def create_project(
    data: ProjectCreate,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    document = checked_document(data.document, user.id, session)
    limits_setting = session.get(Setting, "limits")
    limit = (limits_setting.value if limits_setting else {}).get("projects", 100)
    if (
        session.scalar(
            select(func.count()).select_from(Project).where(Project.owner_id == user.id)
        )
        >= limit
    ):
        raise HTTPException(409, f"Лимит — {limit} проектов на аккаунт")
    project = Project(owner_id=user.id, name=document["name"], document=document)
    session.add(project)
    session.flush()
    revision(session, project)
    session.commit()
    return project_view(project)


@app.get("/api/projects/{project_id}")
def get_project(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    return project_view(owned(session, user, project_id))


@app.put("/api/projects/{project_id}")
def save_project(
    project_id: str,
    data: ProjectWrite,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    project = owned(session, user, project_id)
    document = checked_document(data.document, user.id, session)
    result = session.execute(
        update(Project)
        .where(
            Project.id == project.id,
            Project.owner_id == user.id,
            Project.version == data.version,
            Project.deleted_at.is_(None),
        )
        .values(
            document=document,
            name=document["name"],
            version=data.version + 1,
            updated_at=now(),
        )
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(
            409,
            "Проект изменён в другой вкладке. Сохрани локальную копию или обнови проект.",
        )
    session.refresh(project)
    revision(session, project)
    session.commit()
    return project_view(project)


@app.patch("/api/projects/{project_id}")
def meta(
    project_id: str,
    data: ProjectMeta,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    project = owned(session, user, project_id)
    if data.name is not None:
        if data.version is None:
            raise HTTPException(422, "Нужна версия проекта для переименования")
        name = data.name.strip()
        if not name:
            raise HTTPException(422, "Название не может быть пустым")
        result = session.execute(
            update(Project)
            .where(Project.id == project.id, Project.version == data.version)
            .values(
                name=name,
                document={**project.document, "name": name},
                version=data.version + 1,
            )
        )
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(409, "Проект изменён. Обнови список проектов.")
        session.refresh(project)
        revision(session, project)
    if data.favorite is not None:
        project.favorite = data.favorite
    if data.archived is not None:
        project.archived = data.archived
    project.updated_at = now()
    session.commit()
    return project_view(project)


@app.delete("/api/projects/{project_id}")
def trash(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    project = owned(session, user, project_id)
    project.deleted_at = now()
    session.execute(delete(Share).where(Share.project_id == project.id))
    session.commit()
    return {"ok": True}


@app.post("/api/projects/{project_id}/restore")
def restore(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    p = owned(session, user, project_id, True)
    if p.deleted_at and p.deleted_at < now() - timedelta(days=30):
        raise HTTPException(410, "Срок восстановления истёк")
    p.deleted_at = None
    p.archived = False
    session.commit()
    return project_view(p)


@app.get("/api/projects/{project_id}/versions")
def versions(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    owned(session, user, project_id)
    return [
        {"id": r.id, "version": r.version, "createdAt": r.created_at.isoformat() + "Z"}
        for r in session.scalars(
            select(Revision)
            .where(Revision.project_id == project_id)
            .order_by(Revision.version.desc())
        )
    ]


@app.get("/api/projects/{project_id}/versions/{version_id}")
def version(
    project_id: str,
    version_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    owned(session, user, project_id)
    r = session.get(Revision, version_id)
    if not r or r.project_id != project_id:
        raise HTTPException(404, "Версия не найдена")
    return {"document": r.document, "version": r.version}


@app.post("/api/projects/{project_id}/shares")
def share(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    owned(session, user, project_id)
    token = secrets.token_urlsafe(40)
    record = Share(
        project_id=project_id,
        token=digest(token),
        expires_at=now() + timedelta(days=30),
    )
    session.add(record)
    session.commit()
    return {
        "id": record.id,
        "token": token,
        "expiresAt": record.expires_at.isoformat() + "Z",
    }


@app.get("/api/projects/{project_id}/shares")
def shares(
    project_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    owned(session, user, project_id)
    return [
        {"id": s.id, "expiresAt": s.expires_at.isoformat() + "Z"}
        for s in session.scalars(select(Share).where(Share.project_id == project_id))
    ]


@app.delete("/api/projects/{project_id}/shares/{share_id}")
def revoke(
    project_id: str,
    share_id: str,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    owned(session, user, project_id)
    session.execute(
        delete(Share).where(Share.id == share_id, Share.project_id == project_id)
    )
    session.commit()
    return {"ok": True}


@app.get("/api/shared/{token}")
def shared(token: str, response: Response, session: DBSession = Depends(db)):
    if len(token) > 120:
        raise HTTPException(404, "Ссылка недействительна")
    record = session.scalar(
        select(Share).where(Share.token == digest(token), Share.expires_at > now())
    )
    p = session.get(Project, record.project_id) if record else None
    if not p or p.deleted_at:
        raise HTTPException(404, "Ссылка недействительна или отозвана")
    cookie(response, "roomfit_photo_share_" + p.id, token, min(86400, max(1, int((record.expires_at-now()).total_seconds()))))
    return {
        "name": p.name,
        "document": p.document,
        "version": p.version,
        "readOnly": True,
    }


@app.get("/api/catalog")
def catalog(session: DBSession = Depends(db)):
    return [c.data for c in session.scalars(select(Catalog))]


@app.get("/api/furniture")
def furniture(user: User = Depends(require_user), session: DBSession = Depends(db)):
    return [
        {**f.data, "id": f.id}
        for f in session.scalars(
            select(PersonalFurniture).where(PersonalFurniture.owner_id == user.id)
        )
    ]


@app.post("/api/furniture", status_code=201)
def create_furniture(
    data: dict, user: User = Depends(require_user), session: DBSession = Depends(db)
):
    record = PersonalFurniture(owner_id=user.id, data=checked_catalog(data, user.id, session))
    session.add(record)
    session.commit()
    return {**record.data, "id": record.id}


@app.delete("/api/furniture/{item_id}")
def delete_furniture(
    item_id: str, user: User = Depends(require_user), session: DBSession = Depends(db)
):
    f = session.get(PersonalFurniture, item_id)
    if not f or f.owner_id != user.id:
        raise HTTPException(404, "Предмет не найден")
    session.delete(f)
    session.commit()
    return {"ok": True}


@app.get("/api/admin/users")
def users(user: User = Depends(admin), session: DBSession = Depends(db)):
    return [
        {**public_user(u), "enabled": u.enabled}
        for u in session.scalars(select(User).limit(500))
    ]


@app.patch("/api/admin/users/{user_id}")
def user_status(
    user_id: str,
    data: AdminUser,
    user: User = Depends(admin),
    session: DBSession = Depends(db),
):
    target = session.get(User, user_id)
    if not target or target.id == user.id:
        raise HTTPException(400, "Нельзя изменить этот аккаунт")
    target.enabled = data.enabled
    session.add(
        Audit(
            actor=user.id,
            action="user.enable" if data.enabled else "user.disable",
            entity=user_id,
        )
    )
    session.commit()
    return {"ok": True}


@app.put("/api/admin/catalog/{item_id}")
def edit_catalog(
    item_id: str,
    data: dict,
    user: User = Depends(admin),
    session: DBSession = Depends(db),
):
    data = checked_catalog(data)
    record = session.get(Catalog, item_id)
    if record:
        record.data = {**data, "id": item_id}
    else:
        session.add(Catalog(id=item_id, data={**data, "id": item_id}))
    session.add(Audit(actor=user.id, action="catalog.update", entity=item_id))
    session.commit()
    return {"ok": True}


@app.delete("/api/admin/catalog/{item_id}")
def remove_catalog(
    item_id: str, user: User = Depends(admin), session: DBSession = Depends(db)
):
    session.execute(delete(Catalog).where(Catalog.id == item_id))
    session.add(Audit(actor=user.id, action="catalog.delete", entity=item_id))
    session.commit()
    return {"ok": True}


@app.get("/api/admin/audit")
def audit(user: User = Depends(admin), session: DBSession = Depends(db)):
    return [
        {
            "actor": a.actor,
            "action": a.action,
            "entity": a.entity,
            "createdAt": a.created_at.isoformat() + "Z",
        }
        for a in session.scalars(
            select(Audit).order_by(Audit.created_at.desc()).limit(100)
        )
    ]


@app.get("/api/admin/stats")
def stats(user: User = Depends(admin), session: DBSession = Depends(db)):
    return {
        "users": session.scalar(select(func.count()).select_from(User)),
        "projects": session.scalar(select(func.count()).select_from(Project)),
        "catalog": session.scalar(select(func.count()).select_from(Catalog)),
    }


class TicketCreate(BaseModel):
    text: str = Field(min_length=10, max_length=4000)


class TicketStatus(BaseModel):
    status: str = Field(pattern="^(open|closed)$")


class AdminLimits(BaseModel):
    projects: int = Field(ge=1, le=1000)


class TemplateWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    document: dict


@app.get("/api/templates")
def templates(session: DBSession = Depends(db)):
    return [
        {"id": t.id, "name": t.name, "document": t.document}
        for t in session.scalars(select(Template))
    ]


@app.put("/api/admin/templates/{template_id}")
def edit_template(
    template_id: str,
    data: TemplateWrite,
    user: User = Depends(admin),
    session: DBSession = Depends(db),
):
    if len(template_id) > 100:
        raise HTTPException(422, "Слишком длинный идентификатор")
    document = checked_document(data.document)
    record = session.get(Template, template_id)
    if record:
        record.name = data.name
        record.document = document
    else:
        session.add(Template(id=template_id, name=data.name, document=document))
    session.add(Audit(actor=user.id, action="template.update", entity=template_id))
    session.commit()
    return {"ok": True}


@app.delete("/api/admin/templates/{template_id}")
def delete_template(
    template_id: str, user: User = Depends(admin), session: DBSession = Depends(db)
):
    session.execute(delete(Template).where(Template.id == template_id))
    session.add(Audit(actor=user.id, action="template.delete", entity=template_id))
    session.commit()
    return {"ok": True}


@app.get("/api/admin/limits")
def get_limits(user: User = Depends(admin), session: DBSession = Depends(db)):
    record = session.get(Setting, "limits")
    return record.value if record else {"projects": 100}


@app.put("/api/admin/limits")
def set_limits(
    data: AdminLimits, user: User = Depends(admin), session: DBSession = Depends(db)
):
    record = session.get(Setting, "limits")
    if record:
        record.value = data.model_dump()
    else:
        session.add(Setting(key="limits", value=data.model_dump()))
    session.add(Audit(actor=user.id, action="limits.update", entity="limits"))
    session.commit()
    return data


@app.post("/api/support", status_code=201)
def support(
    data: TicketCreate,
    user: User = Depends(require_user),
    session: DBSession = Depends(db),
):
    if (
        session.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(
                SupportTicket.owner_id == user.id,
                SupportTicket.created_at > now() - timedelta(days=1),
            )
        )
        >= 3
    ):
        raise HTTPException(429, "Не больше трёх обращений в сутки")
    ticket = SupportTicket(owner_id=user.id, text=data.text)
    session.add(ticket)
    session.commit()
    return {"id": ticket.id, "status": ticket.status}


@app.get("/api/admin/support")
def support_list(user: User = Depends(admin), session: DBSession = Depends(db)):
    return [
        {
            "id": t.id,
            "ownerId": t.owner_id,
            "text": t.text,
            "status": t.status,
            "createdAt": t.created_at.isoformat() + "Z",
        }
        for t in session.scalars(
            select(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(100)
        )
    ]


@app.patch("/api/admin/support/{ticket_id}")
def support_status(
    ticket_id: str,
    data: TicketStatus,
    user: User = Depends(admin),
    session: DBSession = Depends(db),
):
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Обращение не найдено")
    ticket.status = data.status
    session.add(Audit(actor=user.id, action="support.status", entity=ticket_id))
    session.commit()
    return {"ok": True}
