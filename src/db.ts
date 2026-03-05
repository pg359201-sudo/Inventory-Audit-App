import { sql } from '@vercel/postgres';
import { put, list } from '@vercel/blob';
import { AuditResult } from './types';
import fs from 'fs';
import path from 'path';

// Detect environment
const isVercel = process.env.VERCEL === '1';
const hasPostgres = !!process.env.POSTGRES_URL;

const BLOB_DB_FILENAME = 'database.json';
const LOCAL_DB_FILENAME = 'local_database.json';

export function initDb() {
  if (isVercel) {
    if (hasPostgres) {
      console.log('Connected to Vercel Postgres.');
    } else {
      console.log('Vercel Postgres not found. Using Vercel Blob as JSON database.');
    }
  } else {
    // Local JSON DB initialization - ONLY in local environment
    try {
      if (!fs.existsSync(LOCAL_DB_FILENAME)) {
        fs.writeFileSync(LOCAL_DB_FILENAME, JSON.stringify([]));
        console.log('Local JSON DB initialized.');
      }
    } catch (e) {
      console.warn('Could not initialize local DB (might be read-only fs):', e);
    }
  }
}

// Helper to get current DB from Blob
async function getBlobDb(): Promise<any[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_DB_FILENAME, limit: 1 });
    const dbBlob = blobs.find(b => b.pathname === BLOB_DB_FILENAME);

    if (dbBlob) {
      const response = await fetch(dbBlob.url);
      if (response.ok) {
        return await response.json();
      }
    }
    return [];
  } catch (error) {
    console.error('Error reading Blob DB:', error);
    return [];
  }
}

// Helper for local JSON DB
function getLocalDb(): any[] {
  try {
    if (fs.existsSync(LOCAL_DB_FILENAME)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_FILENAME, 'utf-8'));
    }
    return [];
  } catch (error) {
    console.error('Error reading local DB:', error);
    return [];
  }
}

function saveLocalDb(data: any[]) {
  fs.writeFileSync(LOCAL_DB_FILENAME, JSON.stringify(data, null, 2));
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
      const newRecord = { ...audit, id: Date.now() };
      const updatedDb = [newRecord, ...currentDb];
      
      await put(BLOB_DB_FILENAME, JSON.stringify(updatedDb), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json'
      });
      
      return newRecord;
    }
  } else {
    // Local JSON
    const currentDb = getLocalDb();
    const newRecord = { ...audit, id: Date.now() };
    const updatedDb = [newRecord, ...currentDb];
    saveLocalDb(updatedDb);
    return newRecord;
  }
}

export async function getHistory() {
  if (isVercel) {
    if (hasPostgres) {
      const { rows } = await sql`SELECT * FROM audits ORDER BY id DESC`;
      return rows;
    } else {
      return await getBlobDb();
    }
  } else {
    return getLocalDb();
  }
}
