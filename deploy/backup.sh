#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/var/backups/roomfit
[[ -d $backup_dir && -f /opt/roomfit/.roomfit-owned ]] || exit 1
stamp=$(date -u +%Y%m%dT%H%M%SZ)
runuser -u postgres -- pg_dump -Fc roomfit > "$backup_dir/roomfit-$stamp.dump"
cp /opt/roomfit/api/.env "$backup_dir/environment-$stamp.env"
# Originals and pinned model versions live outside frontend releases.
if [[ -f /opt/roomfit/api/data/photo-furniture/.roomfit-private-storage ]]; then
    tar -czf "$backup_dir/photo-furniture-$stamp.tgz" -C /opt/roomfit/api/data photo-furniture
fi
find "$backup_dir" -maxdepth 1 -type f -name 'roomfit-*.dump' -mtime +14 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'environment-*.env' -mtime +14 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'photo-furniture-*.tgz' -mtime +14 -delete
# Expired sessions, links, reset tokens and trash are maintained independently.
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m roomfit.maintenance'
