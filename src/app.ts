import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

// --- TYPES ---
interface ClientRule {
  "Codigo FEMSA": string;
  "Nombre Store": string;
  [key: string]: string;
}

interface AuditResult {
  id: number;
  usuario: string;
  fecha: string;
  cliente: string;
  resultado_detallado: string;
  resultado_global: string;
  url_imagen: string;
}

// --- CONFIG ---
const app = express();
const isVercel = process.env.VERCEL === '1';

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- DB LOGIC (Mocked for Debug) ---
async function getDb(): Promise<AuditResult[]> {
  return [];
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  return { ...audit, id: Date.now() };
}

// --- STORAGE LOGIC (Mocked for Debug) ---
async function saveFile(file: Express.Multer.File, filename: string): Promise<string> {
  return "https://placeholder.url/image.jpg";
}

// --- HELPER: Manual CSV Parser ---
function parseCSV(content: string): any[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle potential quotes in CSV if needed, but for now simple split
    // If the CSV is complex, this might break, but the provided CSV looks simple
    const values = lines[i].split(','); 
    
    if (values.length >= headers.length) {
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index]?.trim() || '';
      });
      records.push(record);
    }
  }
  return records;
}

// --- APP SETUP ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: isVercel ? 'vercel' : 'local',
    timestamp: new Date().toISOString(),
    cwd: process.cwd()
  });
});

app.get('/api', (req, res) => {
  res.send("API is running");
});

// Helper to get absolute path
function getDataPath(relativePath: string): string {
  // In Vercel, process.cwd() is usually the root of the function
  // But sometimes files are placed in specific locations
  
  const possiblePaths = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), 'data', path.basename(relativePath)), // Flattened data folder?
    path.resolve(__dirname, '..', relativePath), // Local dev fallback
  ];

  // Check public folder specifically
  if (relativePath.startsWith('public/')) {
     possiblePaths.push(path.join(process.cwd(), 'public', relativePath.replace('public/', '')));
  }

  console.log(`[Debug] Searching for ${relativePath}. CWD: ${process.cwd()}, __dirname: ${__dirname}`);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`[Debug] Found at: ${p}`);
      return p;
    }
  }

  console.warn(`[Debug] File not found: ${relativePath}. Checked: ${possiblePaths.join(', ')}`);
  return path.join(process.cwd(), relativePath); // Default
}

// Configure Multer
const upload = multer({ storage: multer.memoryStorage() });

// Serve uploaded files (local only)
if (!isVercel) {
  app.use('/uploads', express.static(path.resolve('uploads')));
}

// --- ROUTES ---

app.get('/api/clients', (req, res) => {
  try {
    const csvPath = getDataPath('data/reglas-clientes.csv');
    console.log(`Attempting to read CSV from: ${csvPath}`);
    
    if (fs.existsSync(csvPath)) {
      const fileContent = fs.readFileSync(csvPath, 'utf-8');
      const records = parseCSV(fileContent);
      res.json(records);
    } else {
      console.error(`CSV file not found at ${csvPath}`);
      res.status(404).json({ error: 'Client data file not found', path: csvPath });
    }
  } catch (error: any) {
    console.error('Error reading CSV:', error);
    res.status(500).json({ error: 'Failed to load client data', details: error.message });
  }
});

app.post('/api/audit', upload.single('photo'), async (req, res) => {
  try {
    const { usuario, clienteId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No photo uploaded' });

    // Load Client Rules
    const csvPath = getDataPath('data/reglas-clientes.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(500).json({ error: 'Client rules file missing' });
    }
    
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(fileContent);
    const clientRule = records.find((r: any) => r['Codigo FEMSA'] === clienteId);
    
    if (!clientRule) return res.status(404).json({ error: 'Client not found' });

    // Identify required products
    const productColumns = [
      "Gin Gordons", "Gin Tanqueray", "Gin Royale", "Gin Sevilla", 
      "JW Blonde", "Smirnoff Ice", "Vodka Smirnoff 750mL", 
      "Black & White 1L", "JW Black 1L", "JW Red 1L", 
      "Sandy Mac 1L", "Vat 69 1L", "Vat 69 200 ml", "White Horse 1L"
    ];

    const requiredProducts = productColumns.filter(prod => clientRule[prod] === 'Si');

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
      Analyze this image of a liquor shelf.
      Check for: ${productColumns.join(', ')}.
      Return JSON: { "Product Name": "Present" | "Missing" }
    `;

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } }
    ];

    // Add references
    for (const prod of requiredProducts) {
      try {
        let refPath = getDataPath(`public/referencias/${prod}.jpg`);
        if (!fs.existsSync(refPath)) refPath = getDataPath(`public/referencias/${prod.replace(/[^a-zA-Z0-9]/g, ' ')}.jpg`);

        if (fs.existsSync(refPath)) {
          parts.push({ text: `Reference for ${prod}:` });
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(refPath).toString('base64') } });
        }
      } catch (e) {
        console.warn(`Failed to load reference for ${prod}:`, e);
      }
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: { parts }
    });

    const jsonString = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
    const analysisResult = JSON.parse(jsonString);

    // Evaluate
    let globalResult = 'OK';
    const detailedResult: any[] = [];

    productColumns.forEach(prod => {
      const isRequired = clientRule[prod] === 'Si';
      const isPresent = analysisResult[prod] === 'Present';
      detailedResult.push({ productName: prod, required: isRequired, present: isPresent });
      if (isRequired && !isPresent) globalResult = 'Falta Referencia';
    });

    // Save (Mocked)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeClientName = (clientRule['Nombre Store'] || 'Client').replace(/[^a-z0-9]/gi, '_');
    const newFilename = `${safeClientName}_${timestamp}_${globalResult.replace(' ', '_')}.jpg`;
    const fileUrl = await saveFile(file, newFilename);

    await saveToDb({
      usuario,
      fecha: new Date().toISOString(),
      cliente: clientRule['Nombre Store'],
      resultado_detallado: JSON.stringify(detailedResult),
      resultado_global: globalResult,
      url_imagen: fileUrl
    });

    res.json({ globalResult, detailedResult, fileUrl });

  } catch (error: any) {
    console.error('Audit processing error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const rows = await getDb();
    res.json(rows);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Vite Middleware (local only)
if (!isVercel && process.env.NODE_ENV !== 'production') {
  import('vite').then(async (viteModule) => {
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }).catch(err => console.error('Failed to load vite', err));
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

export default app;
