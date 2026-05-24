import { list } from '@vercel/blob';
import fs from 'fs';

async function main() {
  const result = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
  const blobs = result.blobs;

  const history = blobs
    .filter(b => b.pathname.includes('_2026-')) // Ensure it matches the pattern
    .map((b, i) => {
      // Regex to parse CLIENT_NAME_DATE_RESULT.jpg
      const match = b.pathname.match(/^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+)\.jpg$/);
      if (!match) return null;
      
      const cliente = match[1].replace(/_/g, ' ');
      
      const timePart = match[2].substring(11); // 00-32-35-550Z
      const h = timePart.substring(0, 2);
      const m = timePart.substring(3, 5);
      const s = timePart.substring(6, 8);
      const ms = timePart.substring(9, 12);
      const properDate = match[2].substring(0, 10) + 'T' + h + ':' + m + ':' + s + '.' + ms + 'Z';

      let globalResult = match[3].replace(/_/g, ' ');

      return {
        id: Date.now() - i * 1000,
        usuario: 'Auditor',
        fecha: properDate,
        cliente: cliente,
        resultado_detallado: '[Recuperado]',
        resultado_global: globalResult,
        url_imagen: b.url,
        proceso_auditoria: [],
        manual_adjustments: []
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());

  // Save to DB file
  fs.writeFileSync('history.json', JSON.stringify(history, null, 2), 'utf-8');
  console.log('Recovered ' + history.length + ' records!');
}
main();
