// Crea un usuario, o cambia su contraseña si ya existe.
// Uso: npm run user -- <usuario> <contraseña>
import { pool } from './db.js';
import { hashPassword } from './auth.js';

const [usuario, clave] = process.argv.slice(2);
if (!usuario || !clave) {
  console.error('Uso: npm run user -- <usuario> <contraseña>');
  process.exit(1);
}
if (clave.length < 6) {
  console.error('La contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}
const hash = await hashPassword(clave);
await pool.query(
  'INSERT INTO usuarios (usuario, clave_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE clave_hash = VALUES(clave_hash)',
  [usuario, hash]);
await pool.query('DELETE FROM sesiones WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = ?)', [usuario]);
console.log(`Usuario "${usuario}" listo.`);
await pool.end();
