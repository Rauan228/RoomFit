#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
backup_dir=/var/backups/roomfit
snapshot=$(find "$backup_dir" -maxdepth 1 -name 'roomfit-*.dump' -type f | sort | tail -1)
[[ -n $snapshot ]] || { echo 'No backup found'; exit 1; }
# Unique separate database; its exact name is kept for cleanup.
test_db=roomfit_restore_check_$(date -u +%Y%m%d%H%M%S)
[[ $test_db =~ ^roomfit_restore_check_[0-9]{14}$ ]] || exit 1
runuser -u postgres -- createdb "$test_db"
cleanup(){ runuser -u postgres -- dropdb "$test_db"; }
trap cleanup EXIT
runuser -u postgres -- pg_restore --exit-on-error -d "$test_db" < "$snapshot"
runuser -u postgres -- psql -d "$test_db" -Atc 'SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM projects; SELECT COUNT(*) FROM alembic_version;'
echo 'Backup restored successfully to a separate temporary database.'
