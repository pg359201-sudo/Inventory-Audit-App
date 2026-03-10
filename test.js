import express from 'express';
const app = express();
app.post('/api/audit/:id/adjust', (req, res) => res.json({ id: req.params.id }));
app.listen(3001, () => {
  fetch('http://localhost:3001/api/audit/undefined/adjust', { method: 'POST' })
    .then(r => r.text())
    .then(t => { console.log("undefined:", t); });
  fetch('http://localhost:3001/api/audit//adjust', { method: 'POST' })
    .then(r => r.text())
    .then(t => { console.log("empty:", t); process.exit(0); });
});
