import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { put, list } from '@vercel/blob';
import { sql } from '@vercel/postgres';

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
const hasPostgres = !!process.env.POSTGRES_URL;
const BLOB_DB_FILENAME = 'database.json';
const LOCAL_DB_FILENAME = 'local_database.json';

// --- DB LOGIC (Inlined) ---
async function getDb(): Promise<AuditResult[]> {
  try {
    if (isVercel) {
      if (hasPostgres) {
        const { rows } = await sql`SELECT * FROM audits ORDER BY id DESC`;
        return rows as AuditResult[];
      } else {
        const { blobs } = await list({ prefix: BLOB_DB_FILENAME, limit: 1 });
        const dbBlob = blobs.find(b => b.pathname === BLOB_DB_FILENAME);
        if (dbBlob) {
          const response = await fetch(dbBlob.url);
          if (response.ok) return await response.json();
        }
        return [];
      }
    } else {
      if (fs.existsSync(LOCAL_DB_FILENAME)) {
        return JSON.parse(fs.readFileSync(LOCAL_DB_FILENAME, 'utf-8'));
      }
      return [];
    }
  } catch (error) {
    console.error('DB Read Error:', error);
    return [];
  }
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  try {
    if (isVercel) {
      if (hasPostgres) {
        const { rows } = await sql`
          INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen)
          VALUES (${audit.usuario}, ${audit.fecha}, ${audit.cliente}, ${audit.resultado_detallado}, ${audit.resultado_global}, ${audit.url_imagen})
          RETURNING *;
        `;
        return rows[0];
      } else {
        const currentDb = await getDb();
        const newRecord = { ...audit, id: Date.now() };
        const updatedDb = [newRecord, ...currentDb];
        await put(BLOB_DB_FILENAME, JSON.stringify(updatedDb), {
          access: 'public',
          addRandomSuffix: false,
          contentType: 'application/json'
        });
        return newRecord;
      }
    } else {
      const currentDb = await getDb();
      const newRecord = { ...audit, id: Date.now() };
      const updatedDb = [newRecord, ...currentDb];
      fs.writeFileSync(LOCAL_DB_FILENAME, JSON.stringify(updatedDb, null, 2));
      return newRecord;
    }
  } catch (error) {
    console.error('DB Save Error:', error);
    throw error;
  }
}

// --- STORAGE LOGIC (Inlined) ---
async function saveFile(file: Express.Multer.File, filename: string): Promise<string> {
  if (isVercel) {
    const blob = await put(filename, file.buffer, { access: 'public' });
    return blob.url;
  } else {
    const uploadDir = path.resolve('uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    return `/uploads/${filename}`;
  }
}

// --- APP SETUP ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: isVercel ? 'vercel' : 'local',
    timestamp: new Date().toISOString()
  });
});

// EMBEDDED CSV DATA (Fallback)
const EMBEDDED_CSV_DATA = `Codigo FEMSA,Nombre Store,Gin Gordons,Gin Tanqueray,Gin Royale,Gin Sevilla,JW Blonde,Smirnoff Ice,Vodka Smirnoff 750mL,Black & White 1L,JW Black 1L,JW Red 1L,Sandy Mac 1L,Vat 69 1L,Vat 69 200 ml,White Horse 1L,ruta de venta
1800104710 - EL DORADO,EL DORADO 1050,Si,Si,Si,Si,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Dayana Gonzalez
1800031290 - SUPERMERCADO SANTA C,TIENDA INGLESA - EXPRESS SANTA CECILIA,Si,Si,No,No,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Dayana Gonzalez
1800043840 - SUPER UNO,LERNA SA,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Dayana Gonzalez
1800104709 - SUPER UNO,TIENDA INGLESA - EXPRESS SUPER UNO LOCAL 2,Si,Si,No,No,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Dayana Gonzalez
1800015966 - AUT.SERVICE EL VASCO,EL VASCO,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Dayana Gonzalez
1800016309 - SUPERMERCADO ITALIA,SUPERM ITALIA S.R.L.,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Diego Martinez
1800016332 - PANADERIA SATORE,DON JULIO SARTORE S RL,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Diego Martinez
1820002865 - AUTOSERVICIO BASTION,PLANETA SAN JOSE,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Diego Martinez
1800105175 - DISTRIBUIDORA 33,DISTRIBUIDORA 33,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Diego Martinez
1820006798 - POLAKOF,EL DORADO SAN JOSE,Si,Si,Si,Si,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Ignacio Maag Perez
1800025533 - TATA SA,TA-TA 121,Si,Si,Si,Si,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Ignacio Maag Perez
1800016885 - SUPERMERCADO AVENIDA,AVENIDA SUR,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800023496 - SUPER AVENIDA II,AVENIDA NORTE,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800040855 - SUPER AVENIDA CENTRO,AVENIDA CENTRO,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800044725 - SUPER AVENIDA MOLINO,AVENIDA MOLINO,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800049639 - OCHO 24,YEK S.A.,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800016057 - CARIPLAL,COOPERATIVA RIO DE LA PLATA,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800049696 - VICTORIA CUADRA,DOÑA VACA,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1820001012 - SUC ECILA PAULLIER,SUPERMERCADO FOMENTO (SOC.FOM.COL.SUIZ.SUC.EP),Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Ignacio Maag Perez
1800043078 - MARTIN MATOS,CINCO ESQUINAS,No,No,No,No,No,Si,No,No,No,Si,Si,Si,Si,No,Mauricio Oliveri
1800026997 - SINTEL S.A.,SINTEL (ANCAP ROTONDA),Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,No,Mauricio Oliveri
1800029703 - ESTACION MONZA,MONZA (BLANQUEO),Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,No,Mauricio Oliveri
1800043059 - BLANQUEO S.A,PETROBRAS BLANQUEO,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,No,Mauricio Oliveri
1800023134 - SUPER. SAN CONO,SAN CONO (TERMINAL),No,No,No,No,No,Si,No,No,No,Si,Si,Si,Si,No,Mauricio Oliveri
1800026945 - SAN CONO,SAN CONO (CENTRO),Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Mauricio Oliveri
1800015189 - DANIEL ACOSTA,TRES HERMANOS,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Mauricio Oliveri
1800026959 - TATA S.A,TA-TA 315,Si,Si,Si,Si,No,Si,Si,Si,Si,Si,Si,Si,No,Si,Mauricio Oliveri
1800037688 - MARTIN TRIAS,BUTRI (EL GALPON),Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Mauricio Oliveri
1800015104 - ANABEL FIERRO,AUTOSERVICE PATRICIA FIERRO,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,Si,Mauricio Oliveri
1800026918 - NESTOR CONO DAMIAN S,ESSO GIOVANNI FLORIDA,Si,Si,No,No,Si,Si,Si,Si,Si,Si,Si,Si,Si,No,Mauricio Oliveri`;

// Helper to get absolute path
function getDataPath(relativePath: string): string {
  // Try process.cwd() first
  let absolutePath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(absolutePath)) return absolutePath;
  
  // Try relative to __dirname
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  absolutePath = path.resolve(__dirname, '..', relativePath);
  if (fs.existsSync(absolutePath)) return absolutePath;

  // Try public folder variations
  if (relativePath.startsWith('public/')) {
     absolutePath = path.join(process.cwd(), 'public', relativePath.replace('public/', ''));
     if (fs.existsSync(absolutePath)) return absolutePath;
     
     absolutePath = path.join(process.cwd(), '..', relativePath); 
     if (fs.existsSync(absolutePath)) return absolutePath;
  }

  return path.join(process.cwd(), relativePath);
}

// Configure Multer
const upload = multer({ storage: multer.memoryStorage() });

// Serve uploaded files (local only)
if (!isVercel) {
  app.use('/uploads', express.static(path.resolve('uploads')));
}

// --- ROUTES ---

app.get('/api/debug-paths', (req, res) => {
  const cwd = process.cwd();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  res.json({ cwd, __dirname, env: process.env });
});

app.get('/api/clients', (req, res) => {
  try {
    let fileContent = EMBEDDED_CSV_DATA;
    const csvPath = getDataPath('data/reglas-clientes.csv');
    
    if (fs.existsSync(csvPath)) {
      console.log(`Loading clients from file: ${csvPath}`);
      fileContent = fs.readFileSync(csvPath, 'utf-8');
    } else {
      console.warn('CSV file not found, using embedded fallback data');
    }

    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    res.json(records);
  } catch (error) {
    console.error('Error reading CSV:', error);
    try {
      const records = parse(EMBEDDED_CSV_DATA, {
        columns: true,
        skip_empty_lines: true
      });
      res.json(records);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load client data' });
    }
  }
});

app.post('/api/audit', upload.single('photo'), async (req, res) => {
  try {
    const { usuario, clienteId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No photo uploaded' });

    // Load Client Rules
    let fileContent = EMBEDDED_CSV_DATA;
    const csvPath = getDataPath('data/reglas-clientes.csv');
    if (fs.existsSync(csvPath)) fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    const records = parse(fileContent, { columns: true, skip_empty_lines: true });
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
      let refPath = getDataPath(`public/referencias/${prod}.jpg`);
      if (!fs.existsSync(refPath)) refPath = getDataPath(`public/referencias/${prod.replace(/[^a-zA-Z0-9]/g, ' ')}.jpg`);

      if (fs.existsSync(refPath)) {
        parts.push({ text: `Reference for ${prod}:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(refPath).toString('base64') } });
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

    // Save
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

export default app;
