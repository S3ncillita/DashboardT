import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'telpo_sid';
const SESSION_HOURS = 12;

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  const test = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(test, Buffer.from(key, 'hex'));
}

const getToken = (req) => /(?:^|;\s*)telpo_sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];

export async function login(usuario, clave, res) {
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
  // Se verifica igual si el usuario no existe, para no revelar cuáles existen por el tiempo de respuesta.
  const ok = u ? await verifyPassword(clave, u.clave_hash) : (await scrypt(clave, 'x', 64), false);
  if (!ok) return false;
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [token, u.id, SESSION_HOURS]);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
  return true;
}

export async function logout(req, res) {
  const t = getToken(req);
  if (t) await pool.query('DELETE FROM sesiones WHERE token = ?', [t]);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

export async function currentUser(req) {
  const t = getToken(req);
  if (!t) return null;
  const [[row]] = await pool.query(
    `SELECT u.usuario FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira > NOW()`, [t]);
  return row?.usuario || null;
}
