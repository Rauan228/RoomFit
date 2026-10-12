"""Run once as root on the isolated installation. Never prints credentials."""
import os, secrets, subprocess
from pathlib import Path
destination=Path('/opt/roomfit/api/.env')
if destination.exists():
    print('Existing RoomFit environment preserved.')
    raise SystemExit(0)
password=secrets.token_urlsafe(36)
def psql(sql):
    return subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-At'],input=sql,text=True,check=True,capture_output=True).stdout.strip()
if psql("SELECT 1 FROM pg_roles WHERE rolname='roomfit'") or psql("SELECT 1 FROM pg_database WHERE datname='roomfit'"):
    raise SystemExit('RoomFit role/database already exists without an environment file. Refusing to alter it.')
psql(f"CREATE ROLE roomfit LOGIN PASSWORD '{password}';\nCREATE DATABASE roomfit OWNER roomfit;\nREVOKE ALL ON DATABASE roomfit FROM PUBLIC;\nGRANT CONNECT ON DATABASE roomfit TO roomfit;")
content=f'''DATABASE_URL=postgresql+psycopg://roomfit:{password}@127.0.0.1:5432/roomfit
APP_ENV=production
COOKIE_SECURE=true
SECRET_KEY={secrets.token_urlsafe(64)}
FRONTEND_URL=https://roomfit.212.19.134.179.sslip.io
ALLOWED_ORIGINS=https://roomfit.212.19.134.179.sslip.io
SMTP_HOST=
SMTP_PORT=587
SMTP_FROM=
SMTP_USER=
SMTP_PASSWORD=
'''
destination.write_text(content)
os.chmod(destination,0o640)
print('Dedicated PostgreSQL database and protected environment created.')
