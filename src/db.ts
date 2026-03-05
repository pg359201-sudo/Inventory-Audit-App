import { sql } from '@vercel/postgres';
import Database from 'better-sqlite3';
import { AuditResult } from './types';

// Detect environment
const isVercel = process.env.VERCEL === '1';

// Local DB instance (only used if not on Vercel)
let localDb: any;

export function initDb() {
  if (isVercel) {
    // Vercel Postgres tables should be created via SQL script or dashboard
    // We can try to create if not exists, but usually better to do manually
    // For simplicity, we'll assume the table exists or create it
    // But sql template literal doesn't support CREATE TABLE easily without raw query
    console.log('Running on Vercel. Ensure "audits" table exists in Vercel Postgres.');
  } else {
    localDb = new Database('audit.db');
    localDb.exec(`
      CREATE TABLE IF NOT EXISTS audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT,
        fecha TEXT,
        cliente TEXT,
        resultado_detallado TEXT,
        resultado_global TEXT,
        url_imagen TEXT
      )
    `);
    console.log('Local SQLite DB initialized.');
  }
}

export async function saveAudit(audit: Omit<AuditResult, 'id'>) {
  if (isVercel) {
    const { rows } = await sql`
      INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen)
      VALUES (${audit.usuario}, ${audit.fecha}, ${audit.cliente}, ${audit.resultado_detallado}, ${audit.resultado_global}, ${audit.url_imagen})
      RETURNING *;
    `;
    return rows[0];
  } else {
    const stmt = localDb.prepare(`
      INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      audit.usuario,
      audit.fecha,
      audit.cliente,
      audit.resultado_detallado,
      audit.resultado_global,
      audit.url_imagen
    );
    return { ...audit, id: info.lastInsertRowid };
  }
}

export async function getHistory() {
  if (isVercel) {
    const { rows } = await sql`SELECT * FROM audits ORDER BY id DESC`;
    return rows;
  } else {
    const stmt = localDb.prepare('SELECT * FROM audits ORDER BY id DESC');
    return stmt.all();
  }
}
