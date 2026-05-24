import { list } from '@vercel/blob';

async function main() {
  const result = await list({ token: process.env.BLOB_READ_WRITE_TOKEN });
  console.log(result.blobs.map(b => b.pathname));
}
main();
