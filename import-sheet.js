// Carga inicial: copia las filas de la planilla de Google a MySQL.
// Uso: npm run import            (falla si la tabla ya tiene datos)
//      npm run import -- --force (vacía la tabla y vuelve a cargar)
import net from 'node:net';
import { parse } from 'csv-parse/sync';
import { pool } from './db.js';
import { parseDate } from './lib.js';

net.setDefaultAutoSelectFamilyAttemptTimeout(5000); // algunas redes tardan en conectar por IPv6
const SHEET_ID = '1NCMsEgafz5fjAfLZUXuc1yFjoFYUioCfWMoKD8LViZM';
const URL_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const HEADER_ROW = 3;

const [{ n }] = (await pool.query('SELECT COUNT(*) n FROM movimientos'))[0];
if (n > 0 && !process.argv.includes('--force')) {
  console.error(`La tabla ya tiene ${n} filas. Usa --force para reemplazarlas.`);
  process.exit(1);
}

const res = await fetch(URL_CSV);
if (!res.ok) throw new Error(`No se pudo leer la planilla (HTTP ${res.status})`);
const rows = parse(await res.text(), { relax_column_count: true }).slice(HEADER_ROW + 1);

const clean = (s) => {
  s = (s ?? '').trim().replace(/^`+|`+$/g, '').trim();
  return s.startsWith('#REF') ? '' : s;
};

const values = [];
for (const r of rows) {
  const serial = clean(r[5]);
  if (!serial) continue;
  values.push([
    serial, clean(r[4]), clean(r[6]), clean(r[7]), clean(r[8]), clean(r[9]),
    parseDate(r[10]), parseDate(r[12]),
  ]);
}

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  if (n > 0) await conn.query('TRUNCATE TABLE movimientos');
  await conn.query(
    `INSERT INTO movimientos (serial, telpo_id, donde, asignado, coche, empresa, fecha_instalacion, fecha_retiro) VALUES ?`,
    [values],
  );
  await conn.commit();
  console.log(`${values.length} filas importadas.`);
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  await pool.end();
}
