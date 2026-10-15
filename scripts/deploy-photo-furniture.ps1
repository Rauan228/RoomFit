param(
  [string]$VpsHost = '212.19.134.179',
  [string]$VpsUser = 'root',
  [string]$HostKey = 'SHA256:t3a5spxtYvn+xvXckR5aYrA0nYC+IWs80FgHqdSfcZc'
)
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepoRoot
try {
  New-Item -ItemType Directory -Path .local -Force | Out-Null
  $taskFiles = @('api/roomfit/app.py','api/roomfit/project.schema.json','api/migrations/env.py','api/migrations/versions/20261015_photo_furniture.py','asset_factory/blender_photo_import.py','asset_factory/validation.py','deploy/roomfit-photo-worker.service','deploy/backup.sh')
  $taskFiles += @('photo_jobs','photo_models','photo_processing','photo_routes','photo_storage','tripo_client') | ForEach-Object { 'api/roomfit/' + $_ + '.py' }
  $taskArchive = Join-Path $taskRepoRoot '.local/roomfit-photo-furniture.tgz'
  & tar.exe -czf $taskArchive @taskFiles
  if ($LASTEXITCODE -ne 0) { throw 'Photo API archive creation failed' }
  $taskSha = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  $taskPutty = Join-Path $env:ProgramFiles 'PuTTY'
  & (Join-Path $taskPutty 'pscp.exe') -hostkey $HostKey $taskArchive "${VpsUser}@${VpsHost}:/tmp/roomfit-photo-furniture.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'Photo API upload failed' }
  $taskScript = [IO.File]::ReadAllText((Join-Path $taskRepoRoot 'deploy/photo-furniture-update.sh'))
  $taskPayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskScript))
  & (Join-Path $taskPutty 'plink.exe') -no-antispoof -hostkey $HostKey "${VpsUser}@${VpsHost}" ('printf ' + $taskPayload + ' | base64 -d | bash -s -- ' + $taskSha)
  if ($LASTEXITCODE -ne 0) { throw 'Photo API deployment failed' }
} finally { Pop-Location }
