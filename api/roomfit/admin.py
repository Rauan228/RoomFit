import argparse, getpass
from sqlalchemy import select
from .database import Base, engine, SessionLocal, User
from .app import hasher
parser=argparse.ArgumentParser(description='Create or promote a RoomFit administrator')
parser.add_argument('--email',required=True);args=parser.parse_args()
Base.metadata.create_all(engine)
with SessionLocal() as session:
    user=session.scalar(select(User).where(User.email==args.email.lower()))
    if not user:
        password=getpass.getpass('Administrator password (at least 10 characters): ')
        if len(password)<10:raise SystemExit('Password too short')
        user=User(email=args.email.lower(),name='Администратор',password=hasher.hash(password),role='admin');session.add(user)
    else:user.role='admin'
    session.commit();print('Administrator configured.')
