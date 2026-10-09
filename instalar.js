// Instalador interactivo: configura MySQL, carga los datos, crea el primer usuario y deja todo listo.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = '') => (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def;
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const step = (t) => console.log(`\n=== ${t} ===`);

step('1. Conexión a MySQL');
console.log('Usa el usuario que creaste para la app (ver LEEME-INSTALACION.md, paso 3).');
const env = {
  DB_HOST: await ask('Servidor MySQL', 'localhost'),
  DB_PORT: await ask('Puerto', '3306'),
  DB_USER: await ask('Usuario MySQL', 'telpo'),
  DB_PASSWORD: await ask('Contraseña MySQL'),
  DB_NAME: await ask('Nombre de la base', 'telpo_dashboard'),
  PORT: await ask('Puerto del dashboard', '8000'),
};
fs.writeFileSync('.env', Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

step('2. Crear la base y las tablas');
if (run('node', ['setup-db.js']).status !== 0) { console.error('No se pudo crear la base. Revisa los datos de MySQL.'); process.exit(1); }

step('3. Cargar los datos de la planilla');
if (await ask('¿Cargar ahora los datos de la planilla de Google? (s/n)', 's').then((r) => r.toLowerCase() === 's')) {
  if (run('node', ['import-sheet.js']).status !== 0) console.error('La importación falló o la tabla ya tenía datos.');
}

step('4. Primer usuario del dashboard');
for (;;) {
  const u = await ask('Usuario (Enter para terminar)');
  if (!u) break;
  const p = await ask('Contraseña (mínimo 6 caracteres)');
  run('node', ['add-user.js', u, p]);
}
rl.close();

if (process.platform === 'win32') {
  step('5. Firewall y arranque automático');
  const dir = process.cwd();
  run('netsh', ['advfirewall', 'firewall', 'add', 'rule', 'name="Dashboard Telpo"', 'dir=in', 'action=allow', 'protocol=TCP', `localport=${env.PORT}`]);
  run('schtasks', ['/create', '/f', '/tn', '"Dashboard Telpo"', '/sc', 'onstart', '/ru', 'SYSTEM', '/tr', `"${dir}\\iniciar.bat"`]);
  console.log('\nSi viste errores de "acceso denegado", repite este instalador como administrador.');
}
console.log(`\nListo. Para arrancar ahora: doble clic en iniciar.bat y entra a http://localhost:${env.PORT}`);
