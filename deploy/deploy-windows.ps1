# Dashboard Telpo - auto-deploy en Windows (corre cada 2 min via Task Scheduler)
# Trae los cambios de main; si hay nuevos instala dependencias, actualiza tablas y reinicia (pm2).
$ErrorActionPreference = 'Continue'
$repo = 'C:\dashboardTelpo'
$state = Join-Path $env:TEMP 'telpo_last_deploy'

Set-Location $repo

git fetch origin main *> $null
if ($LASTEXITCODE -ne 0) { exit 0 }
git pull --ff-only origin main *> $null
if ($LASTEXITCODE -ne 0) { exit 0 }

$head = (git rev-parse HEAD).Trim()
$last = ''
if (Test-Path $state) { $last = (Get-Content $state -Raw).Trim() }
$depsOk = Test-Path (Join-Path $repo 'node_modules')
if ($head -eq $last -and $depsOk) { exit 0 }

npm install --omit=dev --no-audit --no-fund *> $null
if ($LASTEXITCODE -ne 0) { throw 'npm install fallo' }

# Crea tablas nuevas si el cambio las trae (es idempotente, no toca los datos).
npm run setup *> $null
if ($LASTEXITCODE -ne 0) { throw 'npm run setup fallo (revisar .env y MySQL)' }

pm2 restart telpo-dashboard *> $null
if ($LASTEXITCODE -ne 0) { throw 'El restart de pm2 fallo' }

Set-Content $state $head
Write-Output ("[{0}] Deploy a {1}" -f (Get-Date), $head)
