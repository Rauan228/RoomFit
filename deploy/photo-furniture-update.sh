#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
archive=/tmp/roomfit-photo-furniture.tgz
expected_sha=${1:?Usage: photo-furniture-update.sh SHA256}
[[ $expected_sha =~ ^[a-fA-F0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -
stage=$(mktemp -d /opt/roomfit/.photo-update-XXXXXX)
[[ $stage == /opt/roomfit/.photo-update-* ]] || exit 1
trap '[[ $stage == /opt/roomfit/.photo-update-* ]] && rm -rf -- "$stage"' EXIT
python3 - "$archive" <<'PY'
import sys,tarfile
allowed={
 'api/roomfit/app.py','api/roomfit/project.schema.json',
 *['api/roomfit/'+n+'.py' for n in ['photo_jobs','photo_models','photo_processing','photo_routes','photo_storage','tripo_client']],
 'api/migrations/env.py','api/migrations/versions/20261015_photo_furniture.py',
 'asset_factory/blender_photo_import.py','asset_factory/validation.py',
 'deploy/roomfit-photo-worker.service','deploy/backup.sh',
}
with tarfile.open(sys.argv[1]) as tar:
 members=tar.getmembers()
 if {m.name for m in members} != allowed or any(not m.isfile() for m in members):
  raise SystemExit('Unexpected photo furniture archive members')
PY
tar -xzf "$archive" -C "$stage" --no-same-owner
backup=/opt/roomfit/api-update-backups/$(date -u +%Y%m%dT%H%M%S)-photo-${expected_sha:0:12}
mkdir -p "$backup"
chmod 700 "$backup"
/usr/local/sbin/roomfit-backup
while IFS= read -r name; do
 if [[ -f /opt/roomfit/$name ]]; then mkdir -p "$backup/$(dirname "$name")"; cp -p "/opt/roomfit/$name" "$backup/$name"; fi
done < <(tar -tzf "$archive")
if [[ -f /etc/systemd/system/roomfit-photo-worker.service ]]; then cp -p /etc/systemd/system/roomfit-photo-worker.service "$backup/previous-worker.service"; fi
rollback() {
 trap - ERR
 systemctl stop roomfit-photo-worker || true
 while IFS= read -r name; do
  if [[ -f $backup/$name ]]; then install -m 644 "$backup/$name" "/opt/roomfit/$name"; fi
 done < <(tar -tzf "$archive")
 if [[ -f $backup/previous-worker.service ]]; then
  install -m 644 "$backup/previous-worker.service" /etc/systemd/system/roomfit-photo-worker.service
  systemctl daemon-reload
  systemctl restart roomfit-photo-worker || true
 fi
 systemctl restart roomfit-api
 echo "Photo furniture update failed; previous API code restored. Backup: $backup" >&2
 exit 1
}
trap rollback ERR
systemctl stop roomfit-photo-worker 2>/dev/null || true
while IFS= read -r name; do
 mkdir -p "/opt/roomfit/$(dirname "$name")"
 install -m 644 "$stage/$name" "/opt/roomfit/$name"
done < <(tar -tzf "$archive")
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m alembic upgrade head'
install -d -m 700 -o roomfit -g roomfit /opt/roomfit/api/data/photo-furniture
install -m 644 /opt/roomfit/deploy/roomfit-photo-worker.service /etc/systemd/system/roomfit-photo-worker.service
install -m 700 /opt/roomfit/deploy/backup.sh /usr/local/sbin/roomfit-backup
systemctl daemon-reload
systemctl restart roomfit-api
for attempt in $(seq 1 20); do curl -fsS http://127.0.0.1:4182/api/health >/dev/null && break || sleep 1; done
curl -fsS http://127.0.0.1:4182/api/health >/dev/null
systemctl enable --now roomfit-photo-worker
systemctl is-active roomfit-api roomfit-photo-worker nginx
trap - ERR
printf 'Photo furniture API and worker deployed. Environment was preserved. Backup: %s\n' "$backup"
