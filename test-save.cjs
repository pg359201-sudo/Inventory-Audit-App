const fetch = require('node-fetch');

async function main() {
  const payload = {
    usuario: 'test',
    cliente: 'test',
    fecha: new Date().toISOString(),
    resultado_detallado: 'test',
    resultado_global: 'OK',
    url_imagen: 'test',
    proceso_auditoria: [],
    manual_adjustments: []
  };

  const res = await fetch('http://localhost:3000/api/save-audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log(res.status, await res.text());
}
main();
