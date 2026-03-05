import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve('audit.db');
const db = new Database(dbPath);

export function initDb() {
  const createTable = `
    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL,
      fecha TEXT NOT NULL,
      cliente TEXT NOT NULL,
      resultado_detallado TEXT NOT NULL,
      resultado_global TEXT NOT NULL,
      url_imagen TEXT NOT NULL
    );
  `;
  db.exec(createTable);
  console.log('Database initialized');
}

export default db;
