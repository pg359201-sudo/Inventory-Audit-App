import { sql } from '@vercel/postgres';
import { put, list } from '@vercel/blob';
import { AuditResult } from './types';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Detect environment
const isVercel = process.env.VERCEL === '1';
const hasPostgres = !!process.env.POSTGRES_URL;

// Local DB instance (only used if not on Vercel)
let localDb: any;

const BLOB_DB_FILENAME = 'database.json';

export function initDb() {
  if (isVercel) {
    if (hasPostgres) {
      console.log('Connected to Vercel Postgres.');
    } else {
      console.log('Vercel Postgres not found. Using Vercel Blob as JSON database.');
    }
  } else {
    try {
      const Database = require('better-sqlite3');
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
    } catch (e) {
      console.error('Failed to initialize local SQLite DB:', e);
    }
  }
}

// Helper to get current DB from Blob
async function getBlobDb(): Promise<any[]> {
  try {
    // List files to find our database.json
    const { blobs } = await list({ prefix: BLOB_DB_FILENAME, limit: 1 });
    const dbBlob = blobs.find(b => b.pathname === BLOB_DB_FILENAME);

    if (dbBlob) {
      const response = await fetch(dbBlob.url);
      if (response.ok) {
        return await response.json();
      }
    }
    return []; // Return empty array if file doesn't exist yet
  } catch (error) {
    console.error('Error reading Blob DB:', error);
    return [];
  }
}

export async function saveAudit(audit: Omit<AuditResult, 'id'>) {
  if (isVercel) {
    if (hasPostgres) {
      // Use Postgres
      const { rows } = await sql`
        INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen)
        VALUES (${audit.usuario}, ${audit.fecha}, ${audit.cliente}, ${audit.resultado_detallado}, ${audit.resultado_global}, ${audit.url_imagen})
        RETURNING *;
      `;
      return rows[0];
    } else {
      // Use Blob (JSON)
      const currentDb = await getBlobDb();
      
      // Create new record with a simulated ID
      const newRecord = {
        ...audit,
        id: Date.now(), // Simple ID generation
      };
      
      // Prepend to history (newest first)
      const updatedDb = [newRecord, ...currentDb];
      
      // Save back to Blob
      await put(BLOB_DB_FILENAME, JSON.stringify(updatedDb), {
        access: 'public',
        addRandomSuffix: false, // Overwrite the file
        contentType: 'application/json'
      });
      
      return newRecord;
    }
  } else {
    // Local SQLite
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
    if (hasPostgres) {
      const { rows } = await sql`SELECT * FROM audits ORDER BY id DESC`;
      return rows;
    } else {
      // Read from Blob
      return await getBlobDb();
    }
  } else {
    const stmt = localDb.prepare('SELECT * FROM audits ORDER BY id DESC');
    return stmt.all();
  }
}
