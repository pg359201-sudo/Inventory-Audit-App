import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

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
  proceso_auditoria?: string;
}

// --- CONFIG ---
const app = express();
const isVercel = process.env.VERCEL === '1';

import { sql } from '@vercel/postgres';

// --- PRODUCT DESCRIPTIONS ---
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "Gin Gordons": "Botella transparente con líquido transparente. Su etiqueta tiene letras color rojo, en su parte inferior una franja amarilla y más abajo una delgada franja violeta. Tapa superior predominantemente violeta con leve franja superior e inferior color amarillo.",
  "Gin Tanqueray": "Botella verde oscuro, altura algo inferior a: 'JW Black 1L', 'JW Red 1L', 'Vat 69 1L'. Etiqueta blanca con trazo verde inglés al centro. Sello rojo redondo entre la tapa y la etiqueta. Tapa plateada.",
  "Gin Sevilla": "Botella naranja oscuro o ámbar, altura algo inferior a: 'JW Black 1L', 'JW Red 1L', 'Vat 69 1L'. Etiqueta blanca, trazo verde inglés, marco con detalles verdes y amarillos. Sello rojo redondo entre la tapa y la etiqueta.Tapa roja.",
  "Gin Royale": "Botella violeta o uva, altura algo inferior a: 'JW Black 1L', 'JW Red 1L', 'Vat 69 1L'. Etiqueta blanca, trazo verde inglés, marco con detalles púrpura/uva, verdes y amarillos. Sello rojo redondo entre la tapa y la etiqueta. Tapa violeta.",
  "White Horse 1L": "Botella cilíndrica, líquido ámbar. Gran etiqueta de fondo amarillo, letras rojas en ángulo ascendente y pequeño caballo blanco en la parte superior. Altura similar a: 'JW Black 1L', 'JW Red 1L', 'Vat 69 1L'. Tapa predominantemente negra con fina franja amarilla en la parte superior.",
  "White Horse 200 ml": "Botella de vidrio con formato plano (tipo petaca). Altura casi la mitad de la versión 'White Horse 1L'. Mantiene la etiqueta amarilla característica, pero adaptada a un formato mucho más pequeño. Tapa color amarillo.",
  "Vat 69 1L": "Botella cilíndrica tradicional color verde oscuro. Es aproximadamente el doble de alta que la versión de 200 ml y de formato redondo. Etiqueta negra con letras blancas y delgada franjas superior e inferior roja. Tapa predominantemente negra con fina franja roja en la parte superior y detalles blancos en el centro.",
  "Vat 69 200 ml": "Botella color verde oscuro, con forma plana (tipo petaca). Altura casi a la mitad de: 'JW Black 1L', 'Vat 69 1L'. Etiqueta negra con franjas superior e inferior amarillas, letras blancas con leve ángulo. Tapa predominantemente negra con leve franja amarilla en la parte superior y detalles blancos en el centro.",
  "Smirnoff Ice": "Botella transparente cilíndrica pequeña, líquido blanco turbio/nublado. Altura aprox. 60% de un 'Vodka Smirnoff 750mL' o un 'JW Red 1L'. Pico recubierto con etiqueta blanca, su logo es rojo con letras negras. Tapa fina roja."
};

// --- DB LOGIC (Hybrid: Postgres with In-Memory Fallback) ---
const globalHistory: AuditResult[] = [];

async function createTableIfNotExists() {
  try {
    if (!process.env.POSTGRES_URL) return;
    
    await sql`
      CREATE TABLE IF NOT EXISTS audits (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(255),
        fecha VARCHAR(255),
        cliente VARCHAR(255),
        resultado_detallado TEXT,
        resultado_global VARCHAR(255),
        url_imagen TEXT,
        proceso_auditoria TEXT
      );
    `;
    try {
      await sql`ALTER TABLE audits ADD COLUMN IF NOT EXISTS proceso_auditoria TEXT;`;
    } catch (e) {
      console.log('Column check/add failed (might already exist):', e);
    }
    console.log("Table 'audits' ensured.");
  } catch (error) {
    console.error("Error creating table:", error);
  }
}

async function getDb(): Promise<AuditResult[]> {
  // Try Postgres
  if (process.env.POSTGRES_URL) {
    try {
      const { rows } = await sql`SELECT * FROM audits ORDER BY id DESC LIMIT 100`;
      return rows.map((row: any) => ({
        id: row.id,
        usuario: row.usuario,
        fecha: row.fecha,
        cliente: row.cliente,
        resultado_detallado: row.resultado_detallado,
        resultado_global: row.resultado_global,
        url_imagen: row.url_imagen,
        proceso_auditoria: row.proceso_auditoria
      }));
    } catch (error) {
      console.warn("Postgres fetch failed (using memory fallback):", error);
    }
  }
  // Fallback to Memory
  return globalHistory;
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  // Try Postgres
  if (process.env.POSTGRES_URL) {
    try {
      await sql`
        INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen, proceso_auditoria)
        VALUES (${audit.usuario}, ${audit.fecha}, ${audit.cliente}, ${audit.resultado_detallado}, ${audit.resultado_global}, ${audit.url_imagen}, ${audit.proceso_auditoria || null})
      `;
      return; // Success
    } catch (error) {
      console.error("Postgres insert failed (saving to memory):", error);
    }
  }
  
  // Fallback to Memory
  const newRecord = { ...audit, id: Date.now() };
  globalHistory.unshift(newRecord);
  return newRecord;
}

async function deleteFromDb(ids: number[]) {
  if (ids.length === 0) return;

  // Try Postgres
  if (process.env.POSTGRES_URL) {
    try {
      // Construct a parameterized query for multiple IDs
      // Note: @vercel/postgres supports simple arrays in some contexts, but let's be safe with a loop or ANY
      // Using a loop for simplicity and safety with the template literal tag
      for (const id of ids) {
        await sql`DELETE FROM audits WHERE id = ${id}`;
      }
      return;
    } catch (error) {
      console.error("Postgres delete failed (trying memory):", error);
    }
  }

  // Fallback to Memory
  // We modify the array in place or replace it. Since it's const, we can't reassign, but we can splice.
  // Actually, globalHistory is const but it's an array, so we can mutate it.
  // However, filtering is cleaner. Let's just mutate it for now to match the "const" declaration.
  // Or better, let's just find indices and splice.
  const indicesToRemove = globalHistory
    .map((item, index) => ids.includes(item.id) ? index : -1)
    .filter(index => index !== -1)
    .sort((a, b) => b - a); // Sort descending to splice from end

  for (const index of indicesToRemove) {
    globalHistory.splice(index, 1);
  }
}

// Route to manually initialize DB (useful for first setup)
app.get('/api/init-db', async (req, res) => {
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: 'POSTGRES_URL not found. Configure Vercel Postgres first.' });
  }
  try {
    await createTableIfNotExists();
    res.json({ message: 'Database table "audits" created/verified successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { put, list, del } from '@vercel/blob';

// --- STORAGE LOGIC (Hybrid: Vercel Blob with Fallback) ---
async function saveFile(file: Express.Multer.File, filename: string): Promise<string> {
  // Check for Token
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is missing from environment variables.");
    return "https://placehold.co/600x400?text=Error:+Falta+Token+Blob+(Redesplegar)";
  }

  // Try Vercel Blob
  try {
    const blob = await put(filename, file.buffer, {
      access: 'public',
      contentType: file.mimetype
    });
    return blob.url;
  } catch (error: any) {
    console.error("Blob upload failed:", error);
    
    // Detect Private Store Error
    if (error.message && error.message.includes('Cannot use public')) {
      return "https://placehold.co/600x400?text=Error:+Tu+Blob+Store+es+Privado+(Debe+ser+Publico)";
    }

    // Return a placeholder that indicates the specific error
    const safeError = error.message.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50);
    return `https://placehold.co/600x400?text=Error+Upload:+${safeError}`;
  }
}

// --- HELPER: Manual CSV Parser ---
function parseCSV(content: string): any[] {
  try {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
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
  } catch (e) {
    console.error("CSV Parsing Failed:", e);
    return [];
  }
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

// Helper to get absolute path (Only for reference images now)
function getReferencePath(filename: string): string {
  // Try standard public folder location in Vercel
  const p = path.join(process.cwd(), 'public', 'referencias', filename);
  if (fs.existsSync(p)) return p;
  
  // Try local dev location
  const local = path.join(process.cwd(), '..', 'public', 'referencias', filename);
  if (fs.existsSync(local)) return local;

  return p; // Return default even if missing
}

// Configure Multer
const upload = multer({ storage: multer.memoryStorage() });

// Serve uploaded files (local only)
if (!isVercel) {
  app.use('/uploads', express.static(path.resolve('uploads')));
}

// EMBEDDED CSV DATA (Primary Source)
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

// --- ROUTES ---

app.get('/api/debug-paths', (req, res) => {
  const cwd = process.cwd();
  // __dirname is defined at top level now
  res.json({ cwd, env: process.env });
});

app.get('/api/clients', (req, res) => {
  try {
    console.log('Serving clients from EMBEDDED data (safe mode)');
    const records = parseCSV(EMBEDDED_CSV_DATA);
    res.json(records);
  } catch (error: any) {
    console.error('Error parsing embedded CSV:', error);
    res.status(500).json({ error: 'Failed to load client data', details: error.message });
  }
});

app.get('/api/debug-models', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({error: 'No API Key'});
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.list();
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug-config', (req, res) => {
  res.json({
    hasPostgres: !!process.env.POSTGRES_URL,
    hasBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasGemini: !!process.env.GEMINI_API_KEY,
    nodeEnv: process.env.NODE_ENV
  });
});

app.get('/api/references/count', async (req, res) => {
  try {
    console.log('DEBUG: /api/references/count called (api/index.ts)');
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Fallback to local if no token (dev mode without blob)
      const referencesDir = path.join(process.cwd(), 'public', 'referencias');
      if (!fs.existsSync(referencesDir)) {
        console.log('DEBUG: Local references dir not found');
        return res.json({ count: 0, source: 'local', files: [] });
      }
      const files = fs.readdirSync(referencesDir).filter(file => {
        return !file.startsWith('.') && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
      });
      console.log('DEBUG: Local references count:', files.length);
      return res.json({ count: files.length, source: 'local', files });
    }

    const { blobs } = await list({ prefix: 'referencias/' });
    console.log('DEBUG: Blob references count:', blobs.length);
    
    // Map to just filenames/pathnames
    const filenames = blobs.map(b => b.pathname);
    
    res.json({ count: blobs.length, source: 'blob', files: filenames });
  } catch (error) {
    console.error('Error counting references:', error);
    res.status(500).json({ error: 'Failed to count references' });
  }
});

app.post('/api/references/delete', express.json(), async (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: 'No filenames provided' });
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({ prefix: 'referencias/' });
      const urlsToDelete: string[] = [];
      
      for (const filename of filenames) {
        // Match against pathname (full path) or basename (just filename) to be safe
        const blob = blobs.find(b => b.pathname === filename || path.basename(b.pathname) === filename);
        if (blob) {
          urlsToDelete.push(blob.url);
        }
      }

      if (urlsToDelete.length > 0) {
        await del(urlsToDelete);
      }
      res.json({ message: `Deleted ${urlsToDelete.length} references` });
    } else {
      // Fallback to local
      const referencesDir = path.join(process.cwd(), 'public', 'referencias');
      let deletedCount = 0;
      
      for (const filename of filenames) {
        const filePath = path.join(referencesDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
      res.json({ message: `Deleted ${deletedCount} references` });
    }
  } catch (error) {
    console.error('Error deleting references:', error);
    res.status(500).json({ error: 'Failed to delete references' });
  }
});

app.post('/api/references/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = path.basename(req.file.originalname);

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Upload to Vercel Blob
      const blob = await put(`referencias/${filename}`, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype
      });
      res.json({ message: 'File uploaded successfully to Blob', filename, url: blob.url });
    } else {
      // Fallback to local
      const referencesDir = path.join(process.cwd(), 'public', 'referencias');
      if (!fs.existsSync(referencesDir)) {
        fs.mkdirSync(referencesDir, { recursive: true });
      }
      const filePath = path.join(referencesDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);
      res.json({ message: 'File uploaded successfully to Local', filename });
    }
  } catch (error) {
    console.error('Error uploading reference:', error);
    res.status(500).json({ error: 'Failed to upload reference' });
  }
});

app.post('/api/audit', upload.single('photo'), async (req, res) => {
  const processLog: { step: string; status: 'OK' | 'Error' | 'Warning'; details?: string }[] = [];
  
  try {
    const { usuario, clienteId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No photo uploaded' });

    // Step 1: Check Client Rules
    processLog.push({ step: 'Revisión de tabla de referencias por cliente', status: 'OK', details: `Cliente ID: ${clienteId}` });

    // Load Client Rules (Embedded First)
    const records = parseCSV(EMBEDDED_CSV_DATA);
    const clientRule = records.find((r: any) => r['Codigo FEMSA'] === clienteId);
    
    if (!clientRule) {
      processLog.push({ step: 'Validación de cliente', status: 'Error', details: 'Cliente no encontrado en base de datos' });
      return res.status(404).json({ error: 'Client not found' });
    }

    // Identify required products
    const productColumns = [
      "Gin Gordons", "Gin Tanqueray", "Gin Royale", "Gin Sevilla", 
      "JW Blonde", "Smirnoff Ice", "Vodka Smirnoff 750mL", 
      "Black & White 1L", "JW Black 1L", "JW Red 1L", 
      "Sandy Mac 1L", "Vat 69 1L", "Vat 69 200 ml", "White Horse 1L"
    ];

    const requiredProducts = productColumns.filter(prod => clientRule[prod] === 'Si');

    // Check API Key
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing");
      return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
      Analyze this image of a liquor shelf.
      Check for: ${productColumns.join(', ')}.
      
      IMPORTANT CONTEXT: There may be differences in tones and brightness between the uploaded photo for analysis and the loaded reference photo.

      Return JSON: { "Product Name": "Present" | "Missing" }
    `;

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } }
    ];

    // Step 2: Reference Images Analysis
    let missingRefs = 0;
    
    // NEW: Load Master Reference Image
    try {
        const masterRefName = 'referencias_visuales.jpeg';
        let masterRefData: string | null = null;
        
        // Try Blob
        if (process.env.BLOB_READ_WRITE_TOKEN) {
             try {
                const listResult = await list({ prefix: 'referencias/' });
                const blob = listResult.blobs.find(b => b.pathname.includes(masterRefName));
                if (blob) {
                    const response = await fetch(blob.url);
                    const arrayBuffer = await response.arrayBuffer();
                    masterRefData = Buffer.from(arrayBuffer).toString('base64');
                }
             } catch (e) {
                 console.warn("Failed to list blobs for master ref:", e);
             }
        }

        // Try Local
        if (!masterRefData) {
             const refPath = getReferencePath(masterRefName);
             if (fs.existsSync(refPath)) {
                masterRefData = fs.readFileSync(refPath).toString('base64');
             }
        }

        if (masterRefData) {
            parts.push({ text: `IMPORTANT: I am providing a MASTER REFERENCE IMAGE ('referencias_visuales.jpeg'). This image contains 6 specific products marked with RED ARROWS and their names to help you visually identify them correctly. These products are: "JW Blonde", "Vat 69 200 ml", "Smirnoff Ice", "Gin Tanqueray", "Gin Royale", and "Gin Sevilla". Use this visual guide as the ground truth for identifying these specific bottles.` });
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: masterRefData } });
            processLog.push({ step: 'Carga de Referencias Visuales Maestras', status: 'OK', details: 'Archivo referencias_visuales.jpeg cargado y enviado a la IA' });
        }
    } catch (e) {
        console.warn("Failed to load master reference:", e);
    }

    // Add references (Try to load from Blob or Local)
    let referenceBlobs: any[] = [];
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const listResult = await list({ prefix: 'referencias/' });
        referenceBlobs = listResult.blobs;
      } catch (e) {
        console.warn("Failed to list reference blobs:", e);
      }
    }

    let loadedRefsCount = 0;
    for (const prod of requiredProducts) {
      // 1. Add Visual Description if available
      if (PRODUCT_DESCRIPTIONS[prod]) {
        parts.push({ text: `Visual description for ${prod}: ${PRODUCT_DESCRIPTIONS[prod]}` });
      }

      // 2. Add Reference Image
      try {
        let refData: string | null = null;
        let mimeType = 'image/jpeg';
        
        // Try multiple extensions
        const extensions = ['.jpeg', '.jpg', '.png'];
        const baseNames = [prod, prod.replace(/[^a-zA-Z0-9]/g, ' ')];

        for (const ext of extensions) {
          if (refData) break; // Stop if found
          
          for (const baseName of baseNames) {
             if (refData) break; // Stop if found
             
             const filename = `${baseName}${ext}`;
             
             if (process.env.BLOB_READ_WRITE_TOKEN) {
               // Try to find in Blob list
               const blob = referenceBlobs.find(b => b.pathname === `referencias/${filename}`);
               if (blob) {
                 const response = await fetch(blob.url);
                 const arrayBuffer = await response.arrayBuffer();
                 refData = Buffer.from(arrayBuffer).toString('base64');
                 if (ext === '.png') mimeType = 'image/png';
               }
             } 
             
             // Fallback to local if not found in blob or no token
             if (!refData) {
               const refPath = getReferencePath(filename);
               if (fs.existsSync(refPath)) {
                 refData = fs.readFileSync(refPath).toString('base64');
                 if (ext === '.png') mimeType = 'image/png';
               }
             }
          }
        }

        if (refData) {
          parts.push({ text: `Reference image for ${prod}:` });
          parts.push({ inlineData: { mimeType: mimeType, data: refData } });
          loadedRefsCount++;
        } else {
             missingRefs++;
        }
      } catch (e) {
        console.warn(`Failed to load reference for ${prod}:`, e);
        missingRefs++;
      }
    }
    
    processLog.push({ 
        step: 'Análisis de fotos de referencias', 
        status: missingRefs === 0 ? 'OK' : 'Warning', 
        details: `Cargadas: ${loadedRefsCount}, Faltantes: ${missingRefs}` 
    });

    // Step 3: Context Check
    processLog.push({ step: 'Revisión de contexto importante', status: 'OK', details: 'Prompt y descripciones visuales inyectadas correctamente' });
    
    // Use the confirmed available model
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts }
    });

    let jsonString = response.text || '{}';
    
    // Robust JSON extraction: Find the first '{' and the last '}'
    const firstOpen = jsonString.indexOf('{');
    const lastClose = jsonString.lastIndexOf('}');
    
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      jsonString = jsonString.substring(firstOpen, lastClose + 1);
    } else {
      // Fallback: Try to clean markdown code blocks if simple extraction failed
      jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(jsonString);
    } catch (e) {
      console.error("JSON Parse Error. Raw text:", response.text);
      analysisResult = {};
      processLog.push({ step: 'Análisis de IA', status: 'Error', details: 'Fallo al parsear respuesta JSON de Gemini' });
    }

    // Evaluate
    let globalResult = 'OK';
    const detailedResult: any[] = [];
    const missingReasons: string[] = [];

    productColumns.forEach(prod => {
      const isRequired = clientRule[prod] === 'Si';
      
      // Handle new object structure or fallback to old string
      const resultData = analysisResult[prod];
      
      let isPresent = false;
      let reason = 'No reason provided';

      if (resultData) {
        if (typeof resultData === 'object') {
          isPresent = resultData.status === 'Present';
          reason = resultData.reason || 'No reason text in object';
        } else if (typeof resultData === 'string') {
          isPresent = resultData === 'Present';
          reason = 'AI returned legacy string format'; 
        }
      } else {
         reason = 'AI did not return data for this product';
      }

      detailedResult.push({ productName: prod, required: isRequired, present: isPresent, reason });
      if (isRequired && !isPresent) {
          globalResult = 'Falta Referencia';
          missingReasons.push(`${prod}: ${reason}`);
      }
    });

    // Step 4: Missing References Explanation
    if (missingReasons.length > 0) {
        processLog.push({ 
            step: 'Análisis de referencias faltantes', 
            status: 'Warning', 
            details: missingReasons.join(' | ') 
        });
    } else {
        processLog.push({ step: 'Análisis de referencias faltantes', status: 'OK', details: 'Todas las referencias requeridas fueron encontradas' });
    }

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
      url_imagen: fileUrl,
      proceso_auditoria: JSON.stringify(processLog)
    });

    res.json({ globalResult, detailedResult, fileUrl });

  } catch (error: any) {
    console.error('Audit processing error:', error);
    
    let errorMessage = error.message || 'Internal server error';
    
    // If model not found, try to list available models to help debug
    if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
      try {
         const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
         const listResp: any = await ai.models.list();
         
         // Handle various response structures (including pageInternal seen in logs)
         const models = listResp.models || listResp.data || listResp.pageInternal || listResp;
         
         if (Array.isArray(models)) {
             const modelNames = models.map((m: any) => m.name?.replace('models/', '')).join(', ');
             errorMessage += ` | AVAILABLE MODELS: ${modelNames}`;
         } else {
             errorMessage += ` | COULD NOT PARSE MODELS LIST: ${JSON.stringify(listResp).substring(0, 200)}...`;
         }
      } catch (listError: any) {
         errorMessage += ` | Could not list models: ${listError.message}`;
      }
    }

    res.status(500).json({ error: errorMessage });
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

app.post('/api/history/delete', express.json(), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'Invalid input: ids must be an array' });
    }
    await deleteFromDb(ids);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete records', details: error.message });
  }
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

export default app;
