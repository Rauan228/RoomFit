#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
target=/opt/roomfit
if [[ -e $target && ! -f $target/.roomfit-owned ]]; then echo 'Unrecognised /opt/roomfit directory. Stopping.'; exit 1; fi
if [[ ! -e $target ]] && getent passwd roomfit >/dev/null; then echo 'An unrelated roomfit user exists. Stopping.'; exit 1; fi
archive=/tmp/roomfit-deploy.tgz
[[ -f $archive ]] || { echo 'Upload /tmp/roomfit-deploy.tgz first'; exit 1; }
nginx -t
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install --no-upgrade --no-install-recommends -y postgresql python3-venv
mkdir -p "$target"
touch "$target/.roomfit-owned"
getent passwd roomfit >/dev/null || useradd --system --home-dir "$target" --shell /usr/sbin/nologin roomfit
tar -xzf "$archive" -C "$target"
mkdir -p "$target/api/data" /var/lib/roomfit/acme /var/backups/roomfit
python3 "$target/deploy/provision-database.py"
chown root:roomfit "$target/api/.env"
chmod 640 "$target/api/.env"
chown roomfit:roomfit "$target/api/data"
chmod 750 "$target/api/data"
python3 -m venv "$target/api/.venv"
"$target/api/.venv/bin/python" -m pip install --disable-pip-version-check -q -r "$target/api/requirements.txt"
runuser -u roomfit -- bash -c 'cd /opt/roomfit/api && .venv/bin/python -m alembic upgrade head'
install -m 644 "$target/deploy/roomfit-api.service" /etc/systemd/system/roomfit-api.service
systemctl daemon-reload
systemctl enable --now roomfit-api.service
for attempt in $(seq 1 20); do curl --fail -s http://127.0.0.1:4182/api/health && break || sleep 1; done
curl --fail -s http://127.0.0.1:4182/api/health >/dev/null
cp "$target/deploy/nginx-http.conf" /etc/nginx/sites-available/roomfit
ln -sfn /etc/nginx/sites-available/roomfit /etc/nginx/sites-enabled/roomfit
nginx -t
systemctl reload nginx
certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --webroot -w /var/lib/roomfit/acme -d roomfit.212.19.134.179.sslip.io
cat "$target/deploy/nginx-http.conf" "$target/deploy/nginx-https.conf" > /etc/nginx/sites-available/roomfit
nginx -t
systemctl reload nginx
install -m 700 "$target/deploy/backup.sh" /usr/local/sbin/roomfit-backup
install -m 700 "$target/deploy/certificate-reload.sh" /etc/letsencrypt/renewal-hooks/deploy/roomfit-reload.sh
install -m 644 "$target/deploy/roomfit-backup.service" /etc/systemd/system/roomfit-backup.service
install -m 644 "$target/deploy/roomfit-backup.timer" /etc/systemd/system/roomfit-backup.timer
systemctl daemon-reload
systemctl enable --now roomfit-backup.timer
/usr/local/sbin/roomfit-backup
curl --fail -s https://roomfit.212.19.134.179.sslip.io/api/health
systemctl is-active roomfit-api nginx pm2-root fail2ban
echo 'RoomFit deployment finished.'
