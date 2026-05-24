import { put } from '@vercel/blob';
import fs from 'fs';

async function main() {
  try {
    const data = fs.readFileSync('history.json', 'utf-8');
    await put('history.json', data, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true
    });
    console.log('Saved 343 records to blob!');
  } catch (e) {
    console.error('Blob error:', e);
  }
}
main();
