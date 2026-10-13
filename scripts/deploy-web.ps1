param(
    [string]$VpsHost = '212.19.134.179',
    [string]$VpsUser = 'root',
    [string]$HostKey = 'SHA256:t3a5spxtYvn+xvXckR5aYrA0nYC+IWs80FgHqdSfcZc',
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepoRoot
try {
    if (-not $SkipBuild) {
        $taskPreviousOrigin = $env:VITE_PLATFORM_URL
        try {
            $env:VITE_PLATFORM_URL = 'https://platform.roomfit.art'
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
        } finally { $env:VITE_PLATFORM_URL = $taskPreviousOrigin }
    }
    New-Item -ItemType Directory -Path .local -Force | Out-Null
    $taskArchive = Join-Path $taskRepoRoot '.local/roomfit-web.tgz'
    & tar.exe -czf $taskArchive landing/dist platform/dist deploy/frontend-update.sh deploy/configure-domains.sh deploy/nginx-domains-http.conf deploy/nginx-domains-https.conf deploy/certificate-reload.sh scripts/seo-report.py
    if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
    $taskSha = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskPuttyRoot = Join-Path $env:ProgramFiles 'PuTTY'
    & (Join-Path $taskPuttyRoot 'pscp.exe') -hostkey $HostKey $taskArchive "${VpsUser}@${VpsHost}:/tmp/roomfit-web.tgz"
    if ($LASTEXITCODE -ne 0) { throw 'Frontend upload failed' }
    $taskRemoteScript = "set -euo pipefail`nprintf '%s  %s\n' '$taskSha' '/tmp/roomfit-web.tgz' | sha256sum -c -`ntar -xOf /tmp/roomfit-web.tgz deploy/frontend-update.sh | bash -s -- '$taskSha'"
    $taskPayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($taskRemoteScript))
    & (Join-Path $taskPuttyRoot 'plink.exe') -no-antispoof -hostkey $HostKey "${VpsUser}@${VpsHost}" ('printf ' + $taskPayload + ' | base64 -d | bash')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend activation failed' }
    Write-Output 'RoomFit landing and platform deployed to VPS.'
} finally { Pop-Location }
