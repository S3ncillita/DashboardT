@echo off
rem Instalador del dashboard Telpo. Ejecutar con clic derecho -> "Ejecutar como administrador".
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta instalar Node.js: https://nodejs.org & pause & exit /b 1)
call npm install || (echo Fallo npm install & pause & exit /b 1)
node instalar.js
pause
