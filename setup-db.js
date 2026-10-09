// Crea la base de datos y la tabla. Se puede correr varias veces sin problema.
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { dbConfig, DB_NAME } from './db.js';

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
await conn.query(`USE \`${DB_NAME}\``);
await conn.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
console.log(`Base "${DB_NAME}" lista.`);
await conn.end();
