import { put, list, head } from '@vercel/blob';

async function test() {
  try {
    const listResult = await list({ prefix: 'history.json' });
    console.log("Found blobs:", listResult.blobs.map(b => b.pathname + ' - ' + b.url));
    const target = listResult.blobs.find(b => b.pathname === 'history.json');
    if (target) {
        const fetchUrl = new URL(target.url);
        fetchUrl.searchParams.append('t', Date.now().toString());
        const response = await fetch(fetchUrl.toString(), { cache: 'no-store' });
        const text = await response.text();
        const json = JSON.parse(text);
        console.log(`History length: ${json.length}`);
        if (json.length > 0) {
           console.log("Latest:", json[0]);
        }
    }
  } catch(e) {
     console.error(e);
  }
}

test();
