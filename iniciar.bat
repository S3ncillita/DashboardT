@echo off
rem Arranca el dashboard Telpo. Si se cae, lo vuelve a levantar a los 5 segundos.
cd /d "%~dp0"
:loop
node server.js >> servidor.log 2>&1
timeout /t 5 /nobreak >nul
goto loop
