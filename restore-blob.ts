import { put } from '@vercel/blob';
import fs from 'fs';

async function restore() {
  try {
    const data = fs.readFileSync('history.json', 'utf-8');
    const testResult = await put('history.json', data, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true
    });
    console.log("Restore success:", testResult);
  } catch(e) {
     console.error("Restore error:", e);
  }
}

restore();
