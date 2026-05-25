import fs from 'fs';

async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
         clientBase: "DON JULIO SARTORE S.R.L.", // Ensure valid client
         isRescan: "false"
      })
    });
    if (!res.ok) {
        console.log(res.status, await res.text());
        return;
    }
    const data = await res.json();
    const processLog = data.processLog;
    console.log(processLog.find((p: any) => p.step === 'Carga de Imágenes de Referencia'));
  } catch (e) {
    console.error(e);
  }
}
run();
