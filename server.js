import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { buildItems, today, BAD_PLACES } from './lib.js';
import { currentUser, login, logout } from './auth.js';

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((e) => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message });
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v) => String(v ?? '').trim();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const file = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

app.get('/login', (_req, res) => res.sendFile(file('login.html')));

app.post('/api/login', wrap(async (req, res) => {
  const ok = await login(str(req.body.usuario), String(req.body.clave ?? ''), res);
  if (!ok) throw fail(401, 'Usuario o contraseña incorrectos');
  res.json({ ok: true });
}));

app.post('/api/logout', wrap(async (req, res) => { await logout(req, res); res.json({ ok: true }); }));

// Todo lo que sigue requiere sesión.
app.use(wrap(async (req, res, next) => {
  const user = await currentUser(req);
  if (user) { req.user = user; return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autenticado' });
  res.redirect('/login');
}));

// Cambia el ID Telpo de la fila indicada y deja constancia del ID anterior.
async function setTelpoId(conn, serial, rowId, nuevo, usuario) {
  const [[{ telpo_id: ant }]] = await conn.query('SELECT telpo_id FROM movimientos WHERE id = ?', [rowId]);
  if (!nuevo || ant === nuevo) return;
  if (ant) {
    await conn.query('INSERT INTO cambios_id (serial, id_anterior, id_nuevo, usuario) VALUES (?, ?, ?, ?)',
      [serial, ant, nuevo, usuario || '']);
  }
  await conn.query('UPDATE movimientos SET telpo_id = ? WHERE id = ?', [nuevo, rowId]);
}

app.get('/', (_req, res) => res.sendFile(file('index.html')));
app.get('/api/me', (req, res) => res.json({ usuario: req.user }));

app.get('/api/data', wrap(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM movimientos ORDER BY id');
  const actualizado = new Date().toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
  const [cambios] = await pool.query('SELECT serial, id_anterior, id_nuevo, usuario, fecha FROM cambios_id ORDER BY id');
  const items = buildItems(rows);
  for (const it of items) it.cambios_id = cambios.filter((c) => c.serial === it.serial);
  const [tec] = await pool.query('SELECT nombre FROM tecnicos WHERE activo = 1 ORDER BY nombre');
  res.json({ actualizado, items, tecnicos: tec.map((t) => t.nombre) });
}));

// Instalar: llena la última fila "limpia" del serial (así se mantiene el orden del historial).
app.post('/api/install', wrap(async (req, res) => {
  const serial = str(req.body.serial);
  const coche = str(req.body.coche), empresa = str(req.body.empresa);
  const fecha = str(req.body.fecha) || today();
  if (!serial || !coche || !empresa) throw fail(400, 'Faltan serial, coche o empresa');
  if (!isDate(fecha)) throw fail(400, 'Fecha inválida');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query(
      'SELECT * FROM movimientos WHERE serial = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [serial]);
    if (!last) throw fail(404, 'Serial no encontrado');
    if (last.fecha_instalacion || last.fecha_retiro || BAD_PLACES.has(last.donde.toUpperCase())) throw fail(409, 'Ese serial no está disponible');
    await conn.query(
      "UPDATE movimientos SET asignado = '', donde = '', coche = ?, empresa = ?, fecha_instalacion = ? WHERE id = ?",
      [coche, empresa, fecha, last.id]);
    await setTelpoId(conn, serial, last.id, str(req.body.telpo_id), req.user);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Cambiar el ID Telpo: se corrige en la fila actual del serial; el recorrido anterior conserva el ID que tenía.
app.post('/api/telpo-id', wrap(async (req, res) => {
  const serial = str(req.body.serial), telpo_id = str(req.body.telpo_id);
  if (!serial || !telpo_id) throw fail(400, 'Falta serial o ID Telpo');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query(
      'SELECT id FROM movimientos WHERE serial = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [serial]);
    if (!last) throw fail(404, 'Serial no encontrado');
    await setTelpoId(conn, serial, last.id, telpo_id, req.user);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Quitar un ID repetido de un serial (se borra de todas sus filas y queda registrado).
app.post('/api/telpo-id/quitar', wrap(async (req, res) => {
  const serial = str(req.body.serial), telpo_id = str(req.body.telpo_id);
  if (!serial || !telpo_id) throw fail(400, 'Falta serial o ID Telpo');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('UPDATE movimientos SET telpo_id = \'\' WHERE serial = ? AND telpo_id = ?', [serial, telpo_id]);
    if (!r.affectedRows) throw fail(404, 'Ese serial no tiene ese ID');
    await conn.query("INSERT INTO cambios_id (serial, id_anterior, id_nuevo, usuario) VALUES (?, ?, '', ?)",
      [serial, telpo_id, req.user || '']);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

const nombreTec = (v) => str(v).toUpperCase().replace(/\s+/g, ' ');

async function assertTecnico(conn, nombre, permitido = '') {
  if (!nombre || nombre === permitido) return;
  const [[t]] = await conn.query('SELECT 1 ok FROM tecnicos WHERE nombre = ? AND activo = 1', [nombre]);
  if (!t) throw fail(400, `"${nombre}" no está en la lista de técnicos`);
}

app.post('/api/tecnicos', wrap(async (req, res) => {
  const nombre = nombreTec(req.body.nombre);
  if (!nombre) throw fail(400, 'Falta el nombre');
  await pool.query('INSERT INTO tecnicos (nombre) VALUES (?) ON DUPLICATE KEY UPDATE activo = 1', [nombre]);
  res.json({ ok: true });
}));

// Se desactiva (no se borra) para no perder el nombre en el historial.
app.post('/api/tecnicos/baja', wrap(async (req, res) => {
  await pool.query('UPDATE tecnicos SET activo = 0 WHERE nombre = ?', [nombreTec(req.body.nombre)]);
  res.json({ ok: true });
}));

// Mover un validador que no está instalado: con un técnico, en CAS o disponible.
app.post('/api/mover', wrap(async (req, res) => {
  const serial = str(req.body.serial), destino = str(req.body.destino), tecnico = nombreTec(req.body.tecnico);
  const vals = { tecnico: [tecnico, ''], cas: ['', 'CAS'], disponible: ['', ''] }[destino];
  if (!vals) throw fail(400, 'Destino inválido');
  if (destino === 'tecnico' && !tecnico) throw fail(400, 'Falta el nombre del técnico');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query(
      'SELECT * FROM movimientos WHERE serial = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [serial]);
    if (!last) throw fail(404, 'Serial no encontrado');
    if (destino === 'tecnico') await assertTecnico(conn, tecnico, last.asignado);
    if (last.fecha_instalacion && !last.fecha_retiro) throw fail(409, 'Está instalado: primero hay que retirarlo');
    if (BAD_PLACES.has(last.donde.toUpperCase())) throw fail(409, 'Está marcado como dañado');
    if (last.fecha_instalacion) { // la última fila es un retiro: se agrega una fila nueva debajo
      await conn.query('INSERT INTO movimientos (serial, telpo_id, asignado, donde) VALUES (?, ?, ?, ?)',
        [serial, last.telpo_id, vals[0], vals[1]]);
    } else {
      await conn.query('UPDATE movimientos SET asignado = ?, donde = ? WHERE id = ?', [vals[0], vals[1], last.id]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Retirar: pone la fecha de retiro y agrega una fila limpia debajo (queda disponible).
app.post('/api/retire', wrap(async (req, res) => {
  const serial = str(req.body.serial);
  const fecha = str(req.body.fecha) || today();
  if (!isDate(fecha)) throw fail(400, 'Fecha inválida');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query(
      'SELECT * FROM movimientos WHERE serial = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [serial]);
    if (!last || !last.fecha_instalacion || last.fecha_retiro) throw fail(409, 'Ese serial no está instalado');
    if (fecha < last.fecha_instalacion) throw fail(400, 'El retiro no puede ser antes de la instalación');
    const tecnico = nombreTec(req.body.tecnico);
    await assertTecnico(conn, tecnico);
    await conn.query('UPDATE movimientos SET fecha_retiro = ? WHERE id = ?', [fecha, last.id]);
    await conn.query('INSERT INTO movimientos (serial, telpo_id, asignado) VALUES (?, ?, ?)',
      [serial, last.telpo_id, tecnico]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

const port = Number(process.env.PORT || 8000);
app.listen(port, () => console.log(`Dashboard en http://localhost:${port}`));
