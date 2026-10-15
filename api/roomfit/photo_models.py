"""Additive tables; private furniture itself stays in personal_furniture."""
from sqlalchemy import String, Integer, JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base, uid, now


class PhotoJob(Base):
    __tablename__ = "photo_furniture_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    spec: Mapped[dict] = mapped_column(JSON, default=dict)
    images: Mapped[list] = mapped_column(JSON, default=list)
    provider_task_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phase: Mapped[str] = mapped_column(String(80), default="")
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[object | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[object] = mapped_column(DateTime, default=now, index=True)
    deadline: Mapped[object | None] = mapped_column(DateTime, nullable=True)
    assets: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    furniture_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime, default=now, index=True)
    updated_at: Mapped[object] = mapped_column(DateTime, default=now)


class PhotoCharge(Base):
    # Independent ledger survives account deletion: deleting an account cannot reset global spending.
    __tablename__ = "photo_furniture_charges"
    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_hash: Mapped[str] = mapped_column(String(64), index=True)
    day: Mapped[str] = mapped_column(String(10), index=True)
    reserved: Mapped[int] = mapped_column(Integer)  # hundredths of a Tripo credit
    spent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    state: Mapped[str] = mapped_column(String(30), default="reserved")


class PhotoLock(Base):
    __tablename__ = "photo_furniture_locks"
    key: Mapped[str] = mapped_column(String(30), primary_key=True)
