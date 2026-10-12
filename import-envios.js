// Marca como "Enviado a Telpo" los seriales de la pestaña PARA TELPO de la planilla (.xlsx).
// Agrega una fila nueva al final de cada serial (el recorrido anterior queda intacto), asignada a WPOS.
// Se saltan: los que ya figuran enviados, los que están instalados (hay que retirarlos primero)
// y los que no existen en MySQL.
// Uso: node import-envios.js <archivo.xlsx> ["PARA TELPO"] [--dry]
import readXlsxFile from 'read-excel-file/node';
import { pool } from './db.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
const [file, sheetName = 'PARA TELPO'] = args;
if (!file) { console.error('Uso: node import-envios.js <archivo.xlsx> ["PARA TELPO"] [--dry]'); process.exit(1); }

const sheets = await readXlsxFile(file);
const sheet = sheets.find((s) => s.sheet.trim().toLowerCase() === sheetName.trim().toLowerCase());
if (!sheet) { console.error(`No existe la pestaña "${sheetName}". Pestañas: ${sheets.map((s) => s.sheet).join(' | ')}`); process.exit(1); }

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const hAt = sheet.data.findIndex((r) => r.some((c) => norm(c) === 'SERIAL POS'));
if (hAt < 0) { console.error('No encontré la columna SERIAL POS.'); process.exit(1); }
const header = sheet.data[hAt].map(norm);
const cSerial = header.indexOf('SERIAL POS'), cMarca = header.indexOf('ENVIADO A WPOS'), cObs = header.indexOf('OBSERVACION');

const lista = sheet.data.slice(hAt + 1).map((r) => ({
  serial: String(r[cSerial] ?? '').trim().toUpperCase(),
  marca: cMarca >= 0 ? String(r[cMarca] ?? '').trim() : '',
  obs: cObs >= 0 ? String(r[cObs] ?? '').trim() : '',
})).filter((x) => /^[A-Z]\d{6}[A-Z]\d{7,8}$/.test(x.serial));

const [ultimas] = await pool.query(
  `SELECT m.* FROM movimientos m JOIN (SELECT serial, MAX(id) id FROM movimientos GROUP BY serial) l ON l.id = m.id`);
const ult = new Map(ultimas.map((r) => [r.serial, r]));
const [conId] = await pool.query("SELECT serial, MAX(telpo_id) tid FROM movimientos WHERE telpo_id <> '' GROUP BY serial");
const tid = new Map(conId.map((r) => [r.serial, r.tid]));

const aImportar = [], saltados = { yaEnviado: [], instalado: [], noExiste: [] };
for (const x of lista) {
  const u = ult.get(x.serial);
  if (!u) saltados.noExiste.push(x.serial);
  else if (u.donde.toUpperCase() === 'TELPO') saltados.yaEnviado.push(x.serial);
  else if (u.fecha_instalacion && !u.fecha_retiro) saltados.instalado.push(x.serial);
  else aImportar.push(x);
}

console.log(`Pestaña "${sheet.sheet}": ${lista.length} seriales.`);
console.log(`  a marcar como Enviado a Telpo: ${aImportar.length}`);
console.log(`  ya estaban enviados: ${saltados.yaEnviado.length}`);
console.log(`  no existen en MySQL: ${saltados.noExiste.length}${saltados.noExiste.length ? ' → ' + saltados.noExiste.join(', ') : ''}`);
console.log(`  instalados (se saltan, hay que retirarlos antes): ${saltados.instalado.length}${saltados.instalado.length ? ' → ' + saltados.instalado.join(', ') : ''}`);
console.log(`  fecha de envío: la planilla no la trae, quedan sin fecha`);

if (dry || !aImportar.length) {
  console.log(dry ? '(--dry: no se escribió nada)' : 'Nada que importar.');
} else {
  // En la planilla esos validadores figuran asignados a WPOS, que es quien los lleva a Telpo.
  const filas = aImportar.map((x) => [x.serial, tid.get(x.serial) ?? '', 'WPOS', 'TELPO',
    [`Enviado a Telpo (planilla PARA TELPO${x.marca ? `, marca "${x.marca}"` : ''})`, x.obs].filter(Boolean).join(' · ').slice(0, 1000)]);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO movimientos (serial, telpo_id, asignado, donde, observacion) VALUES ?', [filas]);
    await conn.commit();
    console.log('Importado.');
  } catch (e) {
    await conn.rollback();
    console.error('Falló y no se guardó nada:', e.sqlMessage || e.message);
    process.exitCode = 1;
  } finally { conn.release(); }
}
await pool.end();
