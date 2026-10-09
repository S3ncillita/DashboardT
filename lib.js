export const BAD_PLACES = new Set(['MUERTO', 'MUERTV', 'MUERTOV', 'SINIESTRADO']);

// "16/8/2022" o "16/8/22" -> "2022-08-16" (null si no es fecha válida)
export function parseDate(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(s ?? '');
  if (!m) return null;
  let [, d, mo, y] = m.map(Number);
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const DAY = 86400000;
const diffDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const today = () => new Date().toISOString().slice(0, 10);

// Grupo (lote) de un validador, según el prefijo de su serial.
export function loteDe(serial) {
  if (/^B(19|17)0530/.test(serial)) return 'B viejo';
  if (/^A(13|17)0530/.test(serial)) return 'Telpo viejo';
  if (/^A290530/.test(serial)) return 'Versión A viejos';
  if (/^A550530/.test(serial)) return 'Versión A nuevos';
  return 'Otros';
}

// Agrupa las filas (ordenadas por id) por serial y calcula el estado actual.
export function buildItems(rows) {
  const bySerial = new Map();
  for (const r of rows) {
    const end = r.fecha_retiro || (r.fecha_instalacion ? today() : null);
    const mov = {
      telpo_id: r.telpo_id, donde: r.donde, asignado: r.asignado, coche: r.coche, empresa: r.empresa,
      instalacion: r.fecha_instalacion || '', retiro: r.fecha_retiro || '',
      dias: r.fecha_instalacion && end && end >= r.fecha_instalacion ? diffDays(r.fecha_instalacion, end) : null,
    };
    if (!bySerial.has(r.serial)) bySerial.set(r.serial, []);
    bySerial.get(r.serial).push(mov);
  }
  return [...bySerial].map(([serial, h]) => {
    const last = h[h.length - 1];
    const telpo_id = [...h].reverse().find((x) => x.telpo_id)?.telpo_id || '';
    let estado;
    if (BAD_PLACES.has(last.donde.toUpperCase())) estado = 'Dañado';
    else if (last.instalacion && !last.retiro) estado = 'Instalado';
    else if (last.retiro) estado = 'Retirado';
    else if (last.donde.toUpperCase() === 'CAS') estado = 'En CAS';
    else if (last.asignado) estado = 'Con técnico';
    else estado = 'Disponible';
    return {
      serial, lote: loteDe(serial), telpo_id, estado, actual: last, movimientos: h.length,
      dias_total: h.reduce((s, x) => s + (x.dias || 0), 0), historial: h,
    };
  });
}
