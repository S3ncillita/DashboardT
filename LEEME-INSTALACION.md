# Dashboard Telpo: instalación en la NUC (Windows 10)

## Con auto-deploy (recomendado, igual que la app de música)
En un cmd **como Administrador**:

    git clone https://github.com/S3ncillita/DashboardT.git C:\dashboardTelpo
    cd C:\dashboardTelpo\deploy
    powershell -ExecutionPolicy Bypass -File setup-windows.ps1

Pide la contraseña de root de MySQL y los usuarios del dashboard. Después, cada `git push` a `main`
se despliega solo en 2 minutos. NO instala otro MySQL: el deploy de la app de música apaga
cualquier MySQL que no sea el suyo, así que el dashboard usa el que ya está en el puerto 3306.
Dashboard en `http://IP_DE_LA_NUC:8000`. Logs: `pm2 logs telpo-dashboard`.

---
## Cargar otra pestaña de la planilla (sin borrar lo que ya hay)
1. Descarga la planilla como .xlsx y cópiala a la NUC, por ejemplo en `C:\dashboardTelpo\datos\planilla.xlsx`
   (la carpeta `datos` no se sube a GitHub).
2. Prueba primero, sin guardar nada:

       node import-xlsx.js datos\planilla.xlsx "Nuevo validadores" --dry

3. Si el resumen está bien, repite el comando sin `--dry`. Los seriales que ya existen se saltan,
   así que se puede correr más de una vez sin duplicar.

---
## Instalación manual (alternativa)

## Forma rápida
Haz el paso 3 (usuario de MySQL) y después clic derecho en `instalar.bat` → "Ejecutar como administrador".
Te pregunta los datos de MySQL, carga la planilla, crea tus usuarios, abre el firewall y programa el arranque automático.
Los pasos de abajo son la forma manual.

## 1. Requisitos
- Node.js (versión LTS) instalado: https://nodejs.org
- MySQL 8.0 funcionando (el que ya tienes con Workbench)

## 2. Copiar el proyecto
Descomprime `dashboardTelpo.zip` en, por ejemplo, `C:\dashboardTelpo`.

## 3. Crear el usuario de MySQL para la app
Abre MySQL Workbench, conéctate como root y ejecuta:

    CREATE USER 'telpo'@'localhost' IDENTIFIED BY 'PON_AQUI_UNA_CLAVE';
    GRANT ALL ON telpo_dashboard.* TO 'telpo'@'localhost';
    GRANT CREATE ON *.* TO 'telpo'@'localhost';

## 4. Configurar
Copia `.env.example` como `.env` y completa:

    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=telpo
    DB_PASSWORD=la_clave_del_paso_3
    DB_NAME=telpo_dashboard
    PORT=8000

## 5. Instalar y cargar los datos (en una consola dentro de la carpeta)

    npm install
    npm run setup
    npm run import
    npm run user -- TU_USUARIO TuClave123

`npm run user` se repite una vez por cada persona que vaya a entrar.
Para cambiar una contraseña se vuelve a correr con el mismo usuario.

## 6. Arrancar
Doble clic en `iniciar.bat`. Entra a http://localhost:8000.

## 7. Que lo vean otras PC de la red
Abre el puerto en el firewall (consola como administrador):

    netsh advfirewall firewall add rule name="Dashboard Telpo" dir=in action=allow protocol=TCP localport=8000

Las otras PC entran con http://IP-DE-LA-NUC:8000 (la IP se ve con `ipconfig`).

## 8. Que arranque solo al prender la NUC
Programador de tareas → Crear tarea:
- General: marcar "Ejecutar tanto si el usuario inició sesión como si no".
- Desencadenador: "Al iniciar el sistema".
- Acción: iniciar el programa `C:\dashboardTelpo\iniciar.bat`.

## Importante
- `npm run import` solo se usa UNA vez para la carga inicial. Con `-- --force`
  borra todo lo cargado en el dashboard y vuelve a copiar la planilla.
- Copias de seguridad: en Workbench, Server → Data Export → telpo_dashboard.
- El acceso es por HTTP, sin cifrar: usarlo solo dentro de la red interna.
- El archivo `.env` tiene claves: no se comparte.
