#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/var/backups/roomfit
[[ -d $backup_dir && -f /opt/roomfit/.roomfit-owned ]] || exit 1
stamp=$(date -u +%Y%m%dT%H%M%SZ)
runuser -u postgres -- pg_dump -Fc roomfit > "$backup_dir/roomfit-$stamp.dump"
cp /opt/roomfit/api/.env "$backup_dir/environment-$stamp.env"
find "$backup_dir" -maxdepth 1 -type f -name 'roomfit-*.dump' -mtime +14 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'environment-*.env' -mtime +14 -delete
# Expired sessions, links, reset tokens and trash are maintained independently.
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m roomfit.maintenance'
