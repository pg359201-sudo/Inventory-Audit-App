import { list } from '@vercel/blob';
import { createPool } from '@vercel/postgres';

async function run() {
  console.log('Starting migration...');
  const pool = createPool({ connectionString: process.env.POSTGRES_URL.replace(/^=/, '').trim() });

  // 1. Create table if not exists just in case
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audits (
      id BIGINT PRIMARY KEY,
      usuario TEXT,
      fecha TEXT,
      cliente TEXT,
      resultado_detallado TEXT,
      resultado_global TEXT,
      url_imagen TEXT,
      proceso_auditoria TEXT,
      manual_adjustments JSONB,
      observaciones TEXT
    );
  `);
  
  // 2. Load from blob
  let data = [];
  try {
     const listResult = await list({ prefix: 'history.json' });
     const target = listResult.blobs.find(b => b.pathname === 'history.json');
     if (target) {
        const response = await fetch(target.url + '?t=' + Date.now(), { cache: 'no-store' });
        data = JSON.parse(await response.text());
        console.log(`Blob contains ${data.length} records.`);
     } else {
        console.log('No history.json found in blob.');
     }
  } catch(e) {
     console.error('Error fetching from blob', e);
  }

  if (data.length === 0) {
      // Maybe it is in local history.json
      const fs = require('fs');
      if (fs.existsSync('history.json')) {
         data = JSON.parse(fs.readFileSync('history.json', 'utf8'));
         console.log(`Local history contains ${data.length} records.`);
      }
  }

  // 3. Insert into PG
  for (const record of data) {
    try {
        await pool.query(`
          INSERT INTO audits (id, usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen, proceso_auditoria, manual_adjustments, observaciones)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          record.id,
          record.usuario,
          record.fecha,
          record.cliente,
          typeof record.resultado_detallado === 'string' ? record.resultado_detallado : JSON.stringify(record.resultado_detallado),
          record.resultado_global,
          record.url_imagen,
          typeof record.proceso_auditoria === 'string' ? record.proceso_auditoria : JSON.stringify(record.proceso_auditoria || []),
          JSON.stringify(record.manual_adjustments || []),
          record.observaciones || ''
        ]);
    } catch(e) {
        console.error('Error inserting id:', record.id, e.message);
    }
  }
  
  const res = await pool.query('SELECT count(*) FROM audits');
  console.log(`Total records in PG: ${res.rows[0].count}`);
  process.exit(0);
}

run().catch(console.error);
