#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
archive=/tmp/roomfit-deploy.tgz
expected_sha=${1:?Usage: update.sh EXPECTED_SHA256}
[[ $expected_sha =~ ^[a-fA-F0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -
tar -xzf "$archive" -C /opt/roomfit
cd /opt/roomfit/api
.venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m alembic upgrade head'
install -m 644 /opt/roomfit/deploy/roomfit-api.service /etc/systemd/system/roomfit-api.service
install -m 700 /opt/roomfit/deploy/certificate-reload.sh /etc/letsencrypt/renewal-hooks/deploy/roomfit-reload.sh
install -m 700 /opt/roomfit/deploy/backup.sh /usr/local/sbin/roomfit-backup
systemctl daemon-reload
systemctl restart roomfit-api
for attempt in $(seq 1 20); do curl -fsS http://127.0.0.1:4182/api/health && break || sleep 1; done
curl -fsS http://127.0.0.1:4182/api/health >/dev/null
nginx -t
systemctl reload nginx
/usr/local/sbin/roomfit-backup
echo 'RoomFit updated; protected environment and user data preserved.'
