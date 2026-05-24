import { list } from '@vercel/blob';

async function main() {
  const result = await list({ token: process.env.BLOB_READ_WRITE_TOKEN, prefix: 'history.json' });
  console.log(result.blobs);
}
main();
