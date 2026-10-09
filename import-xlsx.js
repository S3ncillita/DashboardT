// Agrega a MySQL los validadores de una pestaña de un archivo .xlsx. No borra nada:
// los seriales que ya existen se saltan.
// Uso: node import-xlsx.js <archivo.xlsx> "<pestaña>" [--dry] [--replace]
//   --dry      solo muestra qué se importaría, sin escribir.
//   --replace  borra de MySQL todas las filas de los seriales de esa pestaña y las vuelve a cargar
//              desde el archivo (para ponerse al día con la planilla; pierde lo cargado en el dashboard).
import readXlsxFile from 'read-excel-file/node';
import { pool } from './db.js';
import { parseDate } from './lib.js';

const [file, sheetName] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
const replace = process.argv.includes('--replace');
if (!file || !sheetName) {
  console.error('Uso: node import-xlsx.js <archivo.xlsx> "<pestaña>" [--dry]');
  process.exit(1);
}

const sheets = await readXlsxFile(file);
// Excel corta los nombres de pestaña a 31 letras: se acepta el nombre exacto o una parte única.
const want = sheetName.trim().toLowerCase();
const matches = sheets.filter((s) => s.sheet.trim().toLowerCase() === want);
const sheet = matches[0] ?? (() => {
  const part = sheets.filter((s) => s.sheet.trim().toLowerCase().includes(want) || want.includes(s.sheet.trim().toLowerCase()));
  return part.length === 1 ? part[0] : null;
})();
if (!sheet) {
  console.error(`No encontré una pestaña única para "${sheetName}". Pestañas: ${sheets.map((s) => s.sheet).join(' | ')}`);
  process.exit(1);
}

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/:$/, '');
const headerAt = sheet.data.findIndex((r) => r.some((c) => norm(c).startsWith('SERIALES DEL VALID')));
if (headerAt < 0) { console.error('No encontré la fila de títulos (SERIALES DEL VALIDADOR).'); process.exit(1); }
const serialCol = sheet.data[headerAt].findIndex((c) => norm(c).startsWith('SERIALES DEL VALID'));
// Los títulos a veces quedan en otra fila o en blanco, así que las columnas se ubican por posición
// respecto al serial. Hay dos formatos: con "ASIGNADO A" (hoja B) o con una sola columna sin título (hojas A).
const cabecera = sheet.data.slice(Math.max(0, headerAt - 2), headerAt + 1).flat().map(norm);
const conAsignado = cabecera.includes('ASIGNADO A');
const S = serialCol;
const C = conAsignado
  ? { id: S - 1, serial: S, donde: S + 1, asignado: S + 2, coche: S + 3, empresa: S + 4, inst: S + 5, retiro: S + 7 }
  : { id: S - 1, serial: S, coche: S + 2, empresa: S + 3, inst: S + 4, retiro: S + 6 };
const mixta = conAsignado ? -1 : S + 1;
console.log(`Formato detectado: ${conAsignado ? 'con DONDE ESTA / ASIGNADO A' : 'columna única de ubicación'}.`);

const BAD = new Set(['CAS', 'MUERTO', 'MUERTV', 'MUERTOV', 'SINIESTRADO']);
const text = (v) => {
  const s = String(v ?? '').replace(/[\t`]/g, '').trim();
  return s.startsWith('#') ? '' : s.replace(/\.0$/, '');
};
const warnings = [];
// Año con un dígito de más (ej. 20223): se prueba quitando un dígito y se elige el que no queda antes de `min`.
const fixYear = (d, min) => {
  const dig = String(d.getUTCFullYear());
  const opts = new Set();
  for (let i = 0; i < dig.length; i++) {
    const y = Number(dig.slice(0, i) + dig.slice(i + 1));
    const fixed = `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if (y >= 2000 && y <= 2100 && (!min || fixed >= min)) opts.add(fixed);
  }
  return [...opts].sort()[0] ?? null;
};
const date = (v, fila, campo, min) => {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    if (y >= 2000 && y <= 2100) return v.toISOString().slice(0, 10);
    const fixed = fixYear(v, min);
    warnings.push(fixed
      ? `fila ${fila}, ${campo}: el año ${y} no es válido, se ajustó a ${fixed}`
      : `fila ${fila}, ${campo}: el año ${y} no es válido (se importa vacía)`);
    return fixed;
  }
  const d = typeof v === 'string' ? parseDate(v) : null;
  if (d) return d;
  // Día imposible (ej. 31/6): se ajusta al último día de ese mes, para no dejar el movimiento abierto.
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(String(v));
  if (m) {
    const [mo, y] = [Number(m[2]), Number(m[3]) + (m[3].length < 3 ? 2000 : 0)];
    const ult = new Date(Date.UTC(y, mo, 0));
    if (mo >= 1 && mo <= 12 && Number(m[1]) <= 31) {
      const fixed = ult.toISOString().slice(0, 10);
      warnings.push(`fila ${fila}, ${campo}: "${v}" no existe, se ajustó a ${fixed}`);
      return fixed;
    }
  }
  warnings.push(`fila ${fila}, ${campo}: fecha no válida "${v}" (se importa vacía)`);
  return null;
};

const rows = [];
let ignoradas = 0;
sheet.data.slice(headerAt + 1).forEach((r, i) => {
  const serial = text(r[C.serial]).toUpperCase();
  if (!/^[A-Z]\d{6}[A-Z]\d{7,8}$/.test(serial)) { if (r.some((c) => c != null)) ignoradas++; return; }
  const fila = headerAt + 2 + i;
  let donde = C.donde >= 0 ? text(r[C.donde]) : '';
  let asignado = C.asignado >= 0 ? text(r[C.asignado]) : '';
  if (mixta >= 0) {
    const v = text(r[mixta]);
    if (BAD.has(v.toUpperCase())) donde = v.toUpperCase(); else asignado = v.toUpperCase();
  }
  const inst = date(r[C.inst], fila, 'instalación');
  rows.push([serial, text(r[C.id]), donde, asignado, text(r[C.coche]), text(r[C.empresa]),
    inst, date(r[C.retiro], fila, 'retiro', inst)]);
});

const [ya] = await pool.query('SELECT serial, COUNT(*) n FROM movimientos GROUP BY serial');
const existentes = new Set(ya.map((x) => x.serial));
const nuevos = replace ? rows : rows.filter((r) => !existentes.has(r[0]));
if (replace) {
  const borrar = ya.filter((x) => rows.some((r) => r[0] === x.serial));
  console.log(`  --replace: se borrarían ${borrar.reduce((a, x) => a + Number(x.n), 0)} filas de ${borrar.length} seriales ya cargados y se volverían a cargar`);
}
const seriales = (arr) => new Set(arr.map((r) => r[0])).size;

console.log(`Pestaña "${sheet.sheet}": ${rows.length} filas con serial (${seriales(rows)} seriales).`);
if (!replace) console.log(`  ya existen en MySQL: ${seriales(rows) - seriales(nuevos)} seriales (se saltan)`);
console.log(`  a importar: ${nuevos.length} filas, ${seriales(nuevos)} seriales nuevos`);
if (ignoradas) console.log(`  filas sin serial válido ignoradas: ${ignoradas}`);
warnings.forEach((w) => console.log('  AVISO', w));

if (dry || !nuevos.length) {
  console.log(dry ? '(--dry: no se escribió nada)' : 'Nada que importar.');
} else {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (replace) await conn.query('DELETE FROM movimientos WHERE serial IN (?)', [[...new Set(rows.map((r) => r[0]))]]);
    await conn.query(
      'INSERT INTO movimientos (serial, telpo_id, donde, asignado, coche, empresa, fecha_instalacion, fecha_retiro) VALUES ?',
      [nuevos]);
    await conn.commit();
    console.log('Importado.');
  } catch (e) {
    await conn.rollback();
    console.error('Falló y no se guardó nada:', e.sqlMessage || e.message);
    process.exitCode = 1;
  } finally { conn.release(); }
}
await pool.end();
