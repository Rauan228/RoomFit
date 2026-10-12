#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
test -s /opt/roomfit/web-current/landing/dist/index.html
test -s /opt/roomfit/web-current/platform/dist/index.html
target=/etc/nginx/sites-available/roomfit-domains
enabled=/etc/nginx/sites-enabled/roomfit-domains
if [[ -e $target ]] && ! grep -q '^# Managed by RoomFit' "$target"; then
    echo 'Unrecognised RoomFit domain config; stopping.'; exit 1
fi
if [[ -e $enabled && ! -L $enabled ]]; then
    echo 'Unrecognised enabled config; stopping.'; exit 1
fi
backup_dir=/var/backups/roomfit/domain-config-$(date -u +%Y%m%dT%H%M%S)
install -d -m 700 "$backup_dir"
[[ ! -f $target ]] || cp -p "$target" "$backup_dir/roomfit-domains.conf"
apply_config() {
    install -m 644 "$1" "$target"
    ln -sfn "$target" "$enabled"
    if ! nginx -t; then
        if [[ -f $backup_dir/roomfit-domains.conf ]]; then
            cp -p "$backup_dir/roomfit-domains.conf" "$target"
        else
            rm -f "$enabled" "$target"
        fi
        exit 1
    fi
    systemctl reload nginx
}
install -d -m 755 /var/lib/roomfit/acme/.well-known/acme-challenge
if [[ ! -s /etc/letsencrypt/live/roomfit.art/fullchain.pem ]]; then
    apply_config /opt/roomfit/deploy/nginx-domains-http.conf
fi
certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --keep-until-expiring --cert-name roomfit.art --webroot -w /var/lib/roomfit/acme \
    -d roomfit.art -d www.roomfit.art -d platform.roomfit.art
apply_config /opt/roomfit/deploy/nginx-domains-https.conf
python3 - <<'PY'
from pathlib import Path
p = Path('/opt/roomfit/api/.env')
lines = p.read_text().splitlines()
values = {
    'FRONTEND_URL': 'https://platform.roomfit.art',
    'ALLOWED_ORIGINS': 'https://platform.roomfit.art,https://roomfit.212.19.134.179.sslip.io',
}
for name, value in values.items():
    indexes = [i for i, line in enumerate(lines) if line.startswith(name + '=')]
    if len(indexes) > 1:
        raise SystemExit('Duplicate frontend setting: ' + name)
    if indexes:
        lines[indexes[0]] = name + '=' + value
    else:
        lines.append(name + '=' + value)
p.write_text('\n'.join(lines) + '\n')
PY
systemctl restart roomfit-api
for attempt in $(seq 1 20); do
    curl -fsS http://127.0.0.1:4182/api/health && break || sleep 1
done
curl -fsS https://platform.roomfit.art/api/health
printf '\nRoomFit domains configured on the VPS.\n'
