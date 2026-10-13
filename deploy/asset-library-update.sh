#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
archive=/tmp/roomfit-asset-library.tgz
expected_sha=${1:?Usage: asset-library-update.sh SHA256}
[[ $expected_sha =~ ^[a-fA-F0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -
python3 - "$archive" <<'PY'
import sys,tarfile
from pathlib import PurePosixPath
allowed={'validation.py','seed.py','project.schema.json','catalog.json','templates.json','asset-manifest.json','asset-versions.json'}
with tarfile.open(sys.argv[1]) as tar:
    for entry in tar.getmembers():
        path=PurePosixPath(entry.name)
        if not entry.isfile() or path.parts[:2] != ('api','roomfit') or len(path.parts)!=3 or path.name not in allowed:
            raise SystemExit('Unexpected asset API archive entry')
PY
stage=$(mktemp -d /opt/roomfit/.asset-library-stage-XXXXXX)
[[ $stage == /opt/roomfit/.asset-library-stage-* ]] || exit 1
trap '[[ $stage == /opt/roomfit/.asset-library-stage-* ]] && rm -rf -- "$stage"' EXIT
backup=/opt/roomfit/api-update-backups/$(date -u +%Y%m%dT%H%M%S)-${expected_sha:0:12}
mkdir -p "$backup"
/usr/local/sbin/roomfit-backup
tar -xzf "$archive" -C "$stage" --no-same-owner
for name in validation.py seed.py project.schema.json catalog.json templates.json asset-manifest.json asset-versions.json; do
    if [[ -f /opt/roomfit/api/roomfit/$name ]]; then cp -p "/opt/roomfit/api/roomfit/$name" "$backup/$name"; fi
done
# Public catalog snapshot, separate from private furniture and project tables.
(cd /opt/roomfit/api && .venv/bin/python - <<'PY'
import json,sys
from sqlalchemy import select
from roomfit.database import SessionLocal,Catalog
with SessionLocal() as session:
    json.dump([{'id':row.id,'data':row.data} for row in session.scalars(select(Catalog))],sys.stdout)
PY
) > "$backup/catalog-rows.json"
chmod 600 "$backup/catalog-rows.json"
rollback() {
    trap - ERR
    for name in validation.py seed.py project.schema.json catalog.json templates.json asset-manifest.json asset-versions.json; do
        if [[ -f $backup/$name ]]; then
            install -m 644 "$backup/$name" "/opt/roomfit/api/roomfit/$name"
        elif [[ $name == asset-manifest.json || $name == asset-versions.json ]]; then
            rm -f -- "/opt/roomfit/api/roomfit/$name"
        fi
    done
    (cd /opt/roomfit/api && .venv/bin/python - "$backup/catalog-rows.json" "$stage/api/roomfit/catalog.json" <<'PY'
import json,sys
from roomfit.database import SessionLocal,Catalog
previous={row['id']:row['data'] for row in json.load(open(sys.argv[1]))}
managed={row['id'] for row in json.load(open(sys.argv[2]))}
with SessionLocal() as session:
    for id in managed:
        row=session.get(Catalog,id)
        if id in previous:
            if row: row.data=previous[id]
            else: session.add(Catalog(id=id,data=previous[id]))
        elif row:
            session.delete(row)
    session.commit()
PY
    )
    systemctl restart roomfit-api
    printf 'RoomFit API code restored after a failed asset-library update. Database backup is available.\n' >&2
    exit 1
}
trap rollback ERR
for name in validation.py seed.py project.schema.json catalog.json templates.json asset-manifest.json asset-versions.json; do
    install -m 644 "$stage/api/roomfit/$name" "/opt/roomfit/api/roomfit/$name"
done
/opt/roomfit/api/.venv/bin/python -m py_compile /opt/roomfit/api/roomfit/validation.py /opt/roomfit/api/roomfit/seed.py
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m roomfit.seed --refresh-catalog'
systemctl restart roomfit-api
for attempt in $(seq 1 20); do curl -fsS http://127.0.0.1:4182/api/health >/dev/null && break || sleep 1; done
curl -fsS http://127.0.0.1:4182/api/health >/dev/null
systemctl is-active roomfit-api nginx
trap - ERR
printf 'RoomFit compatible asset schema and public catalog updated. Backup: %s\n' "$backup"
