#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /opt/roomfit/.roomfit-owned ]] || exit 1
archive=/tmp/roomfit-web.tgz
expected_sha=${1:?Usage: frontend-update.sh EXPECTED_SHA256}
[[ $expected_sha =~ ^[a-fA-F0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -
python3 - "$archive" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if (path.is_absolute() or '..' in path.parts
                or not path.parts or path.parts[0] not in ('landing', 'platform', 'deploy', 'scripts')
                or not (member.isfile() or member.isdir())):
            raise SystemExit('Unsupported frontend archive entry')
PY
release_id=$(date -u +%Y%m%dT%H%M%S)-${expected_sha:0:12}
release=/opt/roomfit/web-releases/$release_id
[[ ! -e $release ]] || { echo 'Release already exists; stopping.'; exit 1; }
mkdir -p "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
test -s "$release/landing/dist/index.html"
test -s "$release/platform/dist/index.html"
test -s "$release/landing/dist/404.html"
test -s "$release/landing/dist/sitemap.xml"
# Retain hashed chunks for browser tabs opened before this release.
if [[ -e /opt/roomfit/web-current ]]; then
    [[ -L /opt/roomfit/web-current ]] || exit 1
    previous=$(readlink -f /opt/roomfit/web-current)
    [[ $previous == /opt/roomfit/web-releases/* ]] || exit 1
    for app in landing platform; do
        if [[ -d $previous/$app/dist/assets ]]; then
            cp -a --update=none "$previous/$app/dist/assets/." "$release/$app/dist/assets/"
        fi
    done
fi
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
# Only RoomFit's explicitly owned virtual host is replaced. Keep a rollback
# copy, validate before activation, and reload Nginx without stopping it.
target=/etc/nginx/sites-available/roomfit-domains
test -s /etc/letsencrypt/live/roomfit.art/fullchain.pem
[[ -f $target ]] && grep -q '^# Managed by RoomFit' "$target" || exit 1
cp -p "$target" "$release/previous-nginx.conf"
install -m 644 "$release/deploy/nginx-domains-https.conf" "$target"
if ! nginx -t; then
    cp -p "$release/previous-nginx.conf" "$target"
    exit 1
fi
nginx -t
ln -s "$release" /opt/roomfit/.web-next-$release_id
mv -Tf /opt/roomfit/.web-next-$release_id /opt/roomfit/web-current
for file in nginx-domains-http.conf nginx-domains-https.conf certificate-reload.sh configure-domains.sh frontend-update.sh; do
    install -m 644 "$release/deploy/$file" "/opt/roomfit/deploy/$file"
done
install -m 700 /opt/roomfit/deploy/certificate-reload.sh /etc/letsencrypt/renewal-hooks/deploy/roomfit-reload.sh
if ! systemctl reload nginx; then
    cp -p "$release/previous-nginx.conf" "$target"
    [[ -z ${previous:-} ]] || ln -sfn "$previous" /opt/roomfit/web-current
    nginx -t && systemctl reload nginx
    exit 1
fi
printf 'RoomFit web release activated: %s\n' "$release_id"
