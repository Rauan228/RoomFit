param(
  [string]$VpsHost = '212.19.134.179',
  [string]$VpsUser = 'root',
  [string]$HostKey = 'SHA256:t3a5spxtYvn+xvXckR5aYrA0nYC+IWs80FgHqdSfcZc'
)
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepoRoot
try {
  $taskArchive = Join-Path $taskRepoRoot '.local/roomfit-asset-library.tgz'
  & tar.exe -czf $taskArchive api/roomfit/validation.py api/roomfit/seed.py api/roomfit/project.schema.json api/roomfit/catalog.json api/roomfit/templates.json api/roomfit/asset-manifest.json api/roomfit/asset-versions.json
  if ($LASTEXITCODE -ne 0) { throw 'Asset API archive creation failed' }
  $taskSha = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  $taskPutty = Join-Path $env:ProgramFiles 'PuTTY'
  & (Join-Path $taskPutty 'pscp.exe') -hostkey $HostKey $taskArchive "${VpsUser}@${VpsHost}:/tmp/roomfit-asset-library.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'Asset API upload failed' }
  $taskScript = [System.IO.File]::ReadAllText((Join-Path $taskRepoRoot 'deploy/asset-library-update.sh'))
  $taskPayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($taskScript))
  & (Join-Path $taskPutty 'plink.exe') -no-antispoof -hostkey $HostKey "${VpsUser}@${VpsHost}" ('printf ' + $taskPayload + ' | base64 -d | bash -s -- ' + $taskSha)
  if ($LASTEXITCODE -ne 0) { throw 'Asset API publication failed' }
} finally { Pop-Location }
