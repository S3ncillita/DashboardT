import 'dotenv/config';
import mysql from 'mysql2/promise';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  dateStrings: true,
};
export const DB_NAME = process.env.DB_NAME || 'telpo_dashboard';

export const pool = mysql.createPool({ ...dbConfig, database: DB_NAME, connectionLimit: 5 });
