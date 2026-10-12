#!/usr/bin/env bash
set -euo pipefail
if [[ ${RENEWED_LINEAGE:-} == /etc/letsencrypt/live/roomfit.212.19.134.179.sslip.io ]]; then
    nginx -t
    systemctl reload nginx
fi
