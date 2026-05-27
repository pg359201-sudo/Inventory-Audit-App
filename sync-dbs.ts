import { createPool } from '@vercel/postgres';

const AI_STUDIO_URL = 'postgresql://neondb_owner:npg_r43wtOAaMvSR@ep-cool-thunder-aqowj88l-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const VERCEL_URL = 'postgresql://neondb_owner:npg_BWUIra94uwsl@ep-mute-rice-ai2khikv-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migrateData() {
  const sourcePool = createPool({ connectionString: AI_STUDIO_URL });
  const destPool = createPool({ connectionString: VERCEL_URL });

  try {
    const { rows: sourceRows } = await sourcePool.query('SELECT * FROM audits WHERE id > 1000000000');
    console.log(`Fetched ${sourceRows.length} rows from source.`);

    let count = 0;
    for (const row of sourceRows) {
      await destPool.query(`
        INSERT INTO audits (id, usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen, prompt_usado, manual_adjustments)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          usuario = EXCLUDED.usuario,
          fecha = EXCLUDED.fecha,
          cliente = EXCLUDED.cliente,
          resultado_detallado = EXCLUDED.resultado_detallado,
          resultado_global = EXCLUDED.resultado_global,
          url_imagen = EXCLUDED.url_imagen,
          prompt_usado = EXCLUDED.prompt_usado,
          manual_adjustments = EXCLUDED.manual_adjustments
      `, [
        row.id, 
        row.usuario, 
        row.fecha || new Date().toISOString(), 
        row.cliente || 'Unknown', 
        row.resultado_detallado || '[]', 
        row.resultado_global || 'OK', 
        row.url_imagen, 
        row.prompt_usado, 
        row.manual_adjustments
      ]);
      count++;
    }
    console.log(`Successfully upserted ${count} records into Vercel DB.`);

  } catch (err) {
    console.error("Migration Error:", err);
  }
}

migrateData();
