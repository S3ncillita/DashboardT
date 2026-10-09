# Dashboard Telpo - setup unico en la NUC (ejecutar UNA vez como Administrador).
# Requisitos: Node.js, Git, pm2 (ya instalados por la app de musica) y MySQL corriendo en el 3306.
# NO instala MySQL: usa el que ya esta (otro servicio MySQL seria apagado por el deploy de musica).
$ErrorActionPreference = 'Stop'
$repo = 'C:\dashboardTelpo'
$port = 8000

if (-not (Test-Path (Join-Path $repo 'package.json'))) {
  throw 'No se encontro C:\dashboardTelpo. Clona primero: git clone https://github.com/S3ncillita/DashboardT.git C:\dashboardTelpo'
}
Set-Location $repo

Write-Host '== Verificando Node, Git y pm2 =='
node -v
git --version
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { npm install -g pm2 --no-audit --no-fund }

Write-Host '== 1/6 buscar el cliente de MySQL =='
$cli = $null
foreach ($pattern in @('C:\mysql\*\bin\mysql.exe', 'C:\Program Files\MySQL\MySQL Server *\bin\mysql.exe')) {
  $found = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $cli = $found.FullName; break }
}
if (-not $cli) { throw 'No se encontro mysql.exe. Comprueba que MySQL este instalado.' }
Write-Host "  usando $cli"

Write-Host '== 2/6 usuario y base en MySQL =='
$rootPass = Read-Host 'Contrasena del usuario root de MySQL'
$dbPass = node -e "console.log(require('crypto').randomBytes(12).toString('hex'))"
$sql = "CREATE DATABASE IF NOT EXISTS telpo_dashboard CHARACTER SET utf8mb4; " +
  "CREATE USER IF NOT EXISTS 'telpo'@'localhost' IDENTIFIED BY '$dbPass'; " +
  "CREATE USER IF NOT EXISTS 'telpo'@'127.0.0.1' IDENTIFIED BY '$dbPass'; " +
  "ALTER USER 'telpo'@'localhost' IDENTIFIED BY '$dbPass'; " +
  "ALTER USER 'telpo'@'127.0.0.1' IDENTIFIED BY '$dbPass'; " +
  "GRANT ALL PRIVILEGES ON telpo_dashboard.* TO 'telpo'@'localhost'; " +
  "GRANT ALL PRIVILEGES ON telpo_dashboard.* TO 'telpo'@'127.0.0.1'; FLUSH PRIVILEGES;"
& $cli -u root "-p$rootPass" --protocol=tcp -e $sql
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el usuario en MySQL (contrasena de root incorrecta?)' }

Write-Host '== 3/6 .env =='
$envPath = Join-Path $repo '.env'
@("DB_HOST=127.0.0.1", "DB_PORT=3306", "DB_USER=telpo", "DB_PASSWORD=$dbPass", "DB_NAME=telpo_dashboard", "PORT=$port") |
  Set-Content $envPath -Encoding ascii
Write-Host "  .env creado en $envPath"

Write-Host '== 4/6 dependencias, tablas y datos =='
npm install --omit=dev --no-audit --no-fund
npm run setup
$ErrorActionPreference = 'Continue'
npm run import          # carga inicial desde la planilla; si ya hay datos no hace nada
$ErrorActionPreference = 'Stop'

Write-Host '== 5/6 usuarios del dashboard =='
while ($true) {
  $u = Read-Host 'Usuario nuevo del dashboard (Enter para terminar)'
  if (-not $u) { break }
  $p = Read-Host "Contrasena para $u (minimo 6 caracteres)"
  node add-user.js $u $p
}

Write-Host '== 6/6 pm2, firewall y auto-deploy cada 2 min =='
pm2 describe telpo-dashboard *> $null
if ($LASTEXITCODE -ne 0) { pm2 start server.js --name telpo-dashboard --cwd $repo } else { pm2 restart telpo-dashboard }
pm2 save
netsh advfirewall firewall add rule name="Dashboard Telpo $port" dir=in action=allow protocol=TCP localport=$port | Out-Null
schtasks /Create /F /TN "telpo-deploy" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\dashboardTelpo\deploy\deploy-windows.ps1" /SC MINUTE /MO 2 /RL HIGHEST | Out-Null

Write-Host ''
pm2 status
Write-Host "Listo. Dashboard en http://IP_DE_LA_NUC:$port"
Write-Host 'Logs: pm2 logs telpo-dashboard'
