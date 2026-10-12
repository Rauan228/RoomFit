import os
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, String, Text, DateTime, Integer, JSON, Boolean, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from dotenv import load_dotenv
load_dotenv()
Path('data').mkdir(exist_ok=True)
DATABASE_URL=os.getenv('DATABASE_URL','sqlite:///./data/roomfit.db')
engine=create_engine(DATABASE_URL,connect_args={'check_same_thread':False} if DATABASE_URL.startswith('sqlite') else {},pool_pre_ping=True)
SessionLocal=sessionmaker(engine,expire_on_commit=False)
def now():return datetime.now(timezone.utc).replace(tzinfo=None)
def uid():return str(uuid4())
class Base(DeclarativeBase):pass
class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    email:Mapped[str]=mapped_column(String(320),unique=True,index=True)
    name:Mapped[str]=mapped_column(String(120))
    password:Mapped[str]=mapped_column(Text)
    role:Mapped[str]=mapped_column(String(20),default='user')
    enabled:Mapped[bool]=mapped_column(Boolean,default=True)
    preferences:Mapped[dict]=mapped_column(JSON,default=dict)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
class Session(Base):
    __tablename__='sessions'
    token:Mapped[str]=mapped_column(String(64),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    expires_at:Mapped[datetime]=mapped_column(DateTime)
class Project(Base):
    __tablename__='projects'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    owner_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    name:Mapped[str]=mapped_column(String(120))
    document:Mapped[dict]=mapped_column(JSON)
    version:Mapped[int]=mapped_column(Integer,default=1)
    favorite:Mapped[bool]=mapped_column(Boolean,default=False)
    archived:Mapped[bool]=mapped_column(Boolean,default=False)
    deleted_at:Mapped[datetime|None]=mapped_column(DateTime,nullable=True)
    updated_at:Mapped[datetime]=mapped_column(DateTime,default=now)
class Revision(Base):
    __tablename__='revisions'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    version:Mapped[int]=mapped_column(Integer)
    document:Mapped[dict]=mapped_column(JSON)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
class Share(Base):
    __tablename__='shares'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    token:Mapped[str]=mapped_column(String(64),unique=True,index=True)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    expires_at:Mapped[datetime]=mapped_column(DateTime)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
class PersonalFurniture(Base):
    __tablename__='personal_furniture'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    owner_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    data:Mapped[dict]=mapped_column(JSON)
class Catalog(Base):
    __tablename__='catalog'
    id:Mapped[str]=mapped_column(String(100),primary_key=True)
    data:Mapped[dict]=mapped_column(JSON)
class ResetToken(Base):
    __tablename__='reset_tokens'
    token:Mapped[str]=mapped_column(String(64),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    expires_at:Mapped[datetime]=mapped_column(DateTime)
class Audit(Base):
    __tablename__='audit'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    actor:Mapped[str]=mapped_column(String(36))
    action:Mapped[str]=mapped_column(String(100))
    entity:Mapped[str]=mapped_column(String(120))
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
class Setting(Base):
    __tablename__='settings'
    key:Mapped[str]=mapped_column(String(80),primary_key=True)
    value:Mapped[dict]=mapped_column(JSON)
class Template(Base):
    __tablename__='templates'
    id:Mapped[str]=mapped_column(String(100),primary_key=True)
    name:Mapped[str]=mapped_column(String(120))
    document:Mapped[dict]=mapped_column(JSON)
class SupportTicket(Base):
    __tablename__='support_tickets'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    owner_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    text:Mapped[str]=mapped_column(Text)
    status:Mapped[str]=mapped_column(String(20),default='open')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=now)
