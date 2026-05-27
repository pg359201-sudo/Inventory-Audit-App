import { createPool } from '@vercel/postgres';

const AI_STUDIO_URL = (process.env.POSTGRES_URL || '').replace(/^=/, '').trim();
const VERCEL_URL = 'postgresql://neondb_owner:npg_BWUIra94uwsl@ep-mute-rice-ai2khikv-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migrateData() {
  console.log("Connecting to AI Studio DB (Source)...");
  const sourcePool = createPool({ connectionString: AI_STUDIO_URL });
  
  console.log("Connecting to Vercel DB (Destination)...");
  const destPool = createPool({ connectionString: VERCEL_URL });

  try {
    // 1. Create table in destination if not exists
    await destPool.query(`
      CREATE TABLE IF NOT EXISTS audits (
        id BIGINT PRIMARY KEY,
        usuario TEXT,
        fecha TEXT,
        cliente TEXT,
        resultado_detallado TEXT,
        resultado_global TEXT,
        url_imagen TEXT
      )
    `);

    try { await destPool.query('ALTER TABLE audits ALTER COLUMN id TYPE BIGINT'); } catch(e){}
    try { await destPool.query('ALTER TABLE audits ADD COLUMN prompt_usado TEXT'); } catch(e){}
    try { await destPool.query('ALTER TABLE audits ADD COLUMN manual_adjustments TEXT'); } catch(e){}

    try { await sourcePool.query('ALTER TABLE audits ALTER COLUMN id TYPE BIGINT'); } catch(e){}
    try { await sourcePool.query('ALTER TABLE audits ADD COLUMN prompt_usado TEXT'); } catch(e){}
    try { await sourcePool.query('ALTER TABLE audits ADD COLUMN manual_adjustments TEXT'); } catch(e){}



    const { rows: sourceRows } = await destPool.query('SELECT * FROM audits');
    console.log(`Fetched ${sourceRows.length} rows from Vercel.`);

    // 3. Upsert into AI Studio
    let count = 0;
    for (const row of sourceRows) {
      // Upsert
      await sourcePool.query(`
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
        row.fecha, 
        row.cliente, 
        row.resultado_detallado, 
        row.resultado_global, 
        row.url_imagen, 
        row.prompt_usado, 
        row.manual_adjustments || null
      ]);
      count++;
    }
    console.log(`Successfully upserted ${count} records into AI Studio DB.`);

    
    // Check destination final count
    const destCount = await destPool.query('SELECT COUNT(*) FROM audits');
    console.log(`Final Vercel DB Count: ${destCount.rows[0].count}`);

  } catch (err) {
    console.error("Migration Error:", err);
  }
}

migrateData();
