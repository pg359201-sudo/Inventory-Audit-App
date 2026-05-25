import { list } from '@vercel/blob';

async function test() {
  try {
    const listResult = await list({ prefix: 'history.json' });
    const target = listResult.blobs.find(b => b.pathname === 'history.json');
    if (target) {
        const fetchUrl = new URL(target.url);
        fetchUrl.searchParams.append('t', Date.now().toString());
        const response = await fetch(fetchUrl.toString(), { cache: 'no-store' });
        const text = await response.text();
        const json = JSON.parse(text);
        console.log(json.slice(0, 5).map((x: any) => ({fecha: x.fecha, cliente: x.cliente})));
    }
  } catch(e) {}
}
test();
