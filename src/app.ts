import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { put, list, del } from '@vercel/blob';
import { ProductStatus } from './types';
// import { fileURLToPath } from 'url';

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
  manual_adjustments?: string[];
}

// --- PRODUCT DESCRIPTIONS ---
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "Gin Gordons": "Botella de vidrio transparente. Altura equivalente a referencias de 1L (JW Black, JW Red, Vat 69). Etiqueta principal con fondo blanco, destacando la palabra 'GORDON'S' en letras mayúsculas rojas grandes; en su límite inferior presenta una franja gruesa amarilla seguida de una línea delgada violeta. Tapa color violeta con finas franjas amarilla en parte superior e inferior.",
  "Gin Tanqueray": "Botella color verde oscuro con silueta inspirada en una coctelera (hombros redondeados pronunciados).Tapa superior de color plateada.En la parte superior del cuerpo destaca un distintivo sello redondo rojo tipo lacre.La etiqueta principal es un bloque central, y justo debajo tiene una franja horizontal gruesa y muy visible de color plateada.Altura levemente inferior a botellas “JW Red 1L” o “Vat 69 1L”.",
  "Gin Sevilla": "Botella color ámbar/naranja claro con silueta inspirada en una coctelera (hombros redondeados pronunciados).Tapa superior de color rojo.En la parte superior del cuerpo destaca un distintivo sello redondo rojo tipo lacre.La etiqueta principal es un bloque central blanco con bordes claro (verdes/amarillos), y justo debajo tiene una franja horizontal gruesa y muy visible de color naranja.Altura levemente inferior a botellas “JW Red 1L” o “Vat 69 1L”.",
  "Gin Royale": "Botella violeta oscuro con silueta tipo coctelera (hombros redondeados pronunciados). Tapa superior de color violeta . En la parte superior del cuerpo destaca un distintivo sello redondo rojo tipo lacre. La etiqueta principal es un bloque central blanco con bordes oscuros (verdes/amaarillos), y justo debajo tiene una franja horizontal gruesa y muy visible de color verde claro. Altura levemente inferior a botellas “JW Red 1L” o “Vat 69 1L”.",
  "White Horse 1L": "Botella de vidrio transparente con cuerpo cilíndrico, que contiene líquido color ámbar. Altura total equivalente a referencias de 1L (JW Black, JW Red, Vat 69). Etiqueta principal muy amplia con fondo amarillo. Destacan las palabras 'White Horse' en letras rojas grandes dispuestas en ángulo ascendente (diagonal). En su límite inferior, la etiqueta tiene una franja horizontal oscura (marrón/negra). Tapa negra con fina franja superior amarilla.",
  "White Horse 200 ml": "Botella de vidrio transparente con formato plano tipo petaca rectangular, que contiene líquido color ámbar. Puntovisual clave: altura aproximada 50% de una botella estándar de 1 L (como “JW Red 1L” o “Vat 69 1L”). Etiqueta principal amarilla con texto rojo grande en diagonal.Tapa y cápsula del cuello de color amarillo.",
  "Vat 69 1L": "Botella de vidrio verde oscuro con cuerpo cilíndrico tradicional. Altura similar a otras botellas estándar de whisky de 1 L (como “JW Red 1L”). Etiqueta principal negra de gran tamaño con dos finas franjas rojas horizontales (una en el borde superior y otra en el inferior). En el centro destaca el texto blanco grande “VAT 69” y sobre él un sello circular rojo. Tapa y cápsula del cuello negras con una fina franja roja en el borde superior.",
  "Vat 69 200 ml": "Botella de vidrio verde oscuro, formato plano tipo petaca rectangular. Punto visual clave: altura aproximada 50% de una botella de whisky estándar de 1 L (como “JW Red 1L” o “Vat 69 1L”). Etiqueta principal negra con dos franjas amarillas horizontales: una delgada en el borde superior y otra más gruesa en el borde inferior. Tapa negra con fina franja amarilla en el borde superior",
  "Smirnoff Ice": "Botella de vidrio transparente tipo cerveza (cuello largo y cuerpo corto) que contiene líquido blanco turbio.Punto visual clave: altura aproximada 60% de una botella estándar de 1 L (como “JW Red 1L” o “Vat 69 1L”). Etiqueta principal blanca en el cuerpo con un bloque rojo visible. Etiqueta blanca en el cuello. Tapa fina de color rojo",
  "Sandy Mac 1L": "Botella marrón oscuro con cuerpo rectangular  Altura aproximada 75% de una botella estándar de whisky de 1 L (como “Vat 69 1L” o “JW Red 1L”). Presenta una etiqueta angosta amarilla entre el cuello y el cuerpo. Punto visual clave: en la parte inferior del cuerpo aparece una franja horizontal ancha de color amarillo/beige, que contrasta con la botella oscura. Tapa color beige o crema con una fina franja roja en el borde superior",
  "JW Blonde": "Botella color ámbar, de altura levemente inferior a una botella de “JW Red 1L” o “Vat 69 1L”. Etiqueta con fondo amarillo vibrante dispuesta diagonalmente en el cuerpo de la botella. Sobre la etiqueta se encuentra la figura del 'Caminante' (Striding Man) en color azul. Tapa superior de color azul."
};

// --- CONFIG ---
const app = express();
const isVercel = process.env.VERCEL === '1';

// Request Logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// --- DB LOGIC (File-Based / Blob-Based) ---
const DB_FILE = path.join(process.cwd(), 'history.json');

async function loadHistory(): Promise<AuditResult[]> {
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { blobs } = await list({ prefix: 'history.json' });
        const blob = blobs.find(b => b.pathname === 'history.json');
        if (blob) {
          const response = await fetch(blob.url);
          const data = await response.text();
          return JSON.parse(data);
        }
      } catch (e) {
        console.error('Error loading history from Blob:', e);
      }
    }
    // Fallback to local file
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading history:', e);
  }
  return [];
}

async function saveHistory(history: AuditResult[]) {
  try {
    const data = JSON.stringify(history, null, 2);
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await put('history.json', data, {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        });
      } catch (e) {
        console.error('Error saving history to Blob:', e);
      }
    }
    // Always save locally as fallback
    fs.writeFileSync(DB_FILE, data, 'utf-8');
  } catch (e) {
    console.error('Error saving history:', e);
  }
}

let globalHistory: AuditResult[] = await loadHistory();

async function getDb(): Promise<AuditResult[]> {
  return globalHistory;
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  console.log('DEBUG: saveToDb called with keys:', Object.keys(audit));
  if ('proceso_auditoria' in audit) {
      console.log('DEBUG: proceso_auditoria present in saveToDb payload. Length:', audit.proceso_auditoria?.length);
  } else {
      console.error('DEBUG: proceso_auditoria MISSING in saveToDb payload');
  }
  
  const newRecord = { ...audit, id: Date.now() };
  globalHistory.unshift(newRecord);
  await saveHistory(globalHistory);
  return newRecord;
}

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
  res.json({ cwd, __dirname, env: process.env });
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

app.get('/api/references/count', async (req, res) => {
  try {
    console.log('DEBUG: /api/references/count called (src/app.ts)');
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

app.get('/api/references/test-list', (req, res) => {
    console.log('DEBUG: /api/references/test-list called');
    res.json({ status: 'ok', message: 'Test route works' });
});

app.get('/api/list-references', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] DEBUG: /api/list-references called`);
    
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Fallback to local
      const referencesDir = path.join(process.cwd(), 'public', 'referencias');
      console.log(`[${new Date().toISOString()}] DEBUG: Checking local dir: ${referencesDir}`);
      
      if (!fs.existsSync(referencesDir)) {
        console.log(`[${new Date().toISOString()}] DEBUG: Local dir does not exist`);
        return res.json([]);
      }
      const files = fs.readdirSync(referencesDir).filter(file => {
        return !file.startsWith('.') && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
      });
      console.log(`[${new Date().toISOString()}] DEBUG: Found ${files.length} local files`);
      return res.json(files);
    }

    // List everything with the prefix
    console.log(`[${new Date().toISOString()}] DEBUG: Listing blobs with prefix 'referencias/'`);
    const response = await list({ prefix: 'referencias/' });
    const blobs = response.blobs;
    
    console.log(`[${new Date().toISOString()}] DEBUG: Found ${blobs.length} blobs`);
    
    // Map to just filenames/pathnames to see what we have
    const filenames = blobs.map(b => {
      // return the full pathname for now to debug
      return b.pathname;
    });
    
    res.json(filenames);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error listing references:`, error);
    res.status(500).json({ error: 'Failed to list references', details: error.message });
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

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
      Analyze this image of a liquor shelf.
      Check for the presence of the following products: ${requiredProducts.join(', ')}.
      
      You MUST return a JSON object where the keys are the exact product names.
      The value for each key MUST be an object with two fields:
      1. "status": either "Present" or "Missing".
      2. "reason": a short explanation (string) of why you determined this status.

      Example Output:
      {
        "${requiredProducts[0] || 'Gin Gordons'}": { "status": "Present", "reason": "Red label bottle visible on top shelf" },
        "${requiredProducts[1] || 'Gin Royale'}": { "status": "Missing", "reason": "No purple bottle found" }
      }
    `;

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } }
    ];

    // Step 2: Reference Images Analysis
    let missingRefs = 0;
    
    // NEW: Load Master Reference Image
    try {
        const masterRefName = 'referencias_visuales.jpg';
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
            parts.push({ text: `Se incluye una IMAGEN DE REFERENCIA de una góndola. 14 flechas rojas señalan productos específicos con su nombre y funcionan como anclas visuales de referencia. Los productos indicados por las flechas son las referencias relevantes; las demás botellas solo forman parte del contexto de la góndola. Usa la imagen solo como guía visual complementaria.` });
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: masterRefData } });
            processLog.push({ step: 'Carga de Referencias Visuales Maestras', status: 'OK', details: 'Archivo referencias_visuales.jpg cargado y enviado a la IA' });
        } else {
             // processLog.push({ step: 'Carga de Referencias Visuales Maestras', status: 'Warning', details: 'No se encontró el archivo referencias_visuales.jpg' });
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
        const filename = `${prod}.jpg`;
        const altFilename = `${prod.replace(/[^a-zA-Z0-9]/g, ' ')}.jpg`;

        if (process.env.BLOB_READ_WRITE_TOKEN) {
          // Try to find in Blob list
          const blob = referenceBlobs.find(b => b.pathname === `referencias/${filename}` || b.pathname === `referencias/${altFilename}`);
          if (blob) {
            const response = await fetch(blob.url);
            const arrayBuffer = await response.arrayBuffer();
            refData = Buffer.from(arrayBuffer).toString('base64');
          }
        } 
        
        // Fallback to local if not found in blob or no token
        if (!refData) {
          let refPath = getReferencePath(filename);
          if (!fs.existsSync(refPath)) refPath = getReferencePath(altFilename);
          
          if (fs.existsSync(refPath)) {
            refData = fs.readFileSync(refPath).toString('base64');
          }
        }

        if (refData) {
          parts.push({ text: `Reference image for ${prod}:` });
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: refData } });
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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: { parts },
      config: {
        temperature: 0, // Force deterministic output
      }
    });

    const jsonString = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
    console.log("Gemini Raw Response:", jsonString); // DEBUG LOG
    
    let analysisResult;
    try {
      analysisResult = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse JSON:", e);
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

      if (!isRequired) {
          reason = 'No auditado (No requerido por el cliente)';
      } else if (resultData) {
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

    console.log('Saving audit with process log length:', processLog.length); // DEBUG

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
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

const adjustAuditHandler = async (req: express.Request, res: express.Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid audit ID' });
    }
    const { productName } = req.body;

    const audit = globalHistory.find(a => a.id === id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    // Initialize array if it doesn't exist
    if (!audit.manual_adjustments) {
      audit.manual_adjustments = [];
    }

    // Toggle the product in the manual_adjustments array
    const index = audit.manual_adjustments.indexOf(productName);
    if (index > -1) {
      // If it's already there, remove it (revert adjustment)
      audit.manual_adjustments.splice(index, 1);
    } else {
      // If it's not there, add it (apply adjustment)
      audit.manual_adjustments.push(productName);
    }

    await saveHistory(globalHistory);

    res.json({ success: true, audit });
  } catch (error: any) {
    console.error('Adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust audit' });
  }
};

app.post('/api/audit/:id/adjust', express.json(), adjustAuditHandler);
app.patch('/api/audit/:id/adjust', express.json(), adjustAuditHandler);

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
      return res.status(400).json({ error: 'Invalid ids array' });
    }
    
    globalHistory = globalHistory.filter(record => !ids.includes(record.id));
    await saveHistory(globalHistory);
    
    res.json({ success: true, deletedCount: ids.length });
  } catch (error) {
    console.error('History delete error:', error);
    res.status(500).json({ error: 'Failed to delete history records' });
  }
});

// Vite Middleware (local only)
if (!isVercel && process.env.NODE_ENV !== 'production') {
  try {
    const viteModule = await import('vite');
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } catch (err) {
    console.error('Failed to load vite', err);
  }
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

export default app;
