from datetime import timedelta
from sqlalchemy import delete, select
from .database import SessionLocal, Session, Share, ResetToken, Project, Revision, now
with SessionLocal() as session:
    for table in [Session,Share,ResetToken]:session.execute(delete(table).where(table.expires_at<now()))
    ids=list(session.scalars(select(Project.id).where(Project.deleted_at<now()-timedelta(days=30))))
    for table in [Share,Revision]:session.execute(delete(table).where(table.project_id.in_(ids)))
    session.execute(delete(Project).where(Project.id.in_(ids)))
    session.commit()
