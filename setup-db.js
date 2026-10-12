// Crea la base de datos y la tabla. Se puede correr varias veces sin problema.
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { dbConfig, DB_NAME } from './db.js';

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
await conn.query(`USE \`${DB_NAME}\``);
await conn.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

// Columnas agregadas después de la primera versión: CREATE TABLE IF NOT EXISTS no las agrega a una tabla vieja.
const nuevas = { fecha_envio: 'DATE NULL', fecha_devolucion: 'DATE NULL', observacion: "VARCHAR(200) NOT NULL DEFAULT ''" };
for (const [col, ddl] of Object.entries(nuevas)) {
  const [[ex]] = await conn.query(
    'SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [DB_NAME, 'movimientos', col]);
  if (!ex.n) { await conn.query(`ALTER TABLE movimientos ADD COLUMN ${col} ${ddl}`); console.log(`Columna agregada: ${col}`); }
}
console.log(`Base "${DB_NAME}" lista.`);
await conn.end();
