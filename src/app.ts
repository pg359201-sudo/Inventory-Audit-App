import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { put, list, del } from '@vercel/blob';
import { createPool } from '@vercel/postgres';
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
  observaciones?: string;
}

// --- PRODUCT DESCRIPTIONS ---
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "Gin Gordons": "Forma: Botella transparente, alta (referencia 1L).\nCRÍTICO: Bloque blanco muy visible en el centro del cuerpo + tapa violeta. No intentar leer texto.",
  "Gin Tanqueray": "Forma: Silueta tipo coctelera (hombros redondeados).\nCRÍTICO: Vidrio verde oscuro. Franja inferior plateada bajo la etiqueta principal.",
  "Gin Sevilla": "Forma: Silueta tipo coctelera.\nCRÍTICO: Vidrio ámbar/naranja. Franja inferior naranja bajo la etiqueta principal.",
  "Gin Royale": "Forma: Silueta tipo coctelera.\nCRÍTICO: Vidrio violeta oscuro. Franja inferior verde claro bajo la etiqueta principal.",
  "White Horse 1L": "Forma: Cilíndrica, alta. Vidrio transparente, líquido ámbar.\nCRÍTICO: Etiqueta amarilla gigante que domina casi todo el frente de la botella. NO confundir con formato petaca.",
  "White Horse 200 ml": "Forma: Rectangular, plana (tipo petaca).\nCRÍTICO: Botella chata. Altura a la mitad (50%) de las referencias normales.",
  "Vat 69 1L": "Forma: Cilíndrica, alta. Vidrio verde oscuro.\nCRÍTICO: Etiqueta negra central con texto blanco \"VAT 69\" y un sello rojo en la parte superior.",
  "Vat 69 200 ml": "Forma: Rectangular, plana (tipo petaca). Vidrio verde oscuro.\nCRÍTICO: Botella chata. Altura a la mitad (50%). Buscar franjas amarillas en la etiqueta (NO rojas).",
  "Sandy Mac 1L": "·\tFormato:\u00a0Cuadrada/rectangular, ancha y robusta. Altura más baja que las botellas estándar de 1L del estante.\n·\tColor:\u00a0Vidrio ámbar muy oscuro (se ve casi negro en góndola).\n·\tEtiquetas:\u00a0Etiqueta central grande color crema/dorada (suele tener una franja inferior del mismo color).\n·\tCRÍTICO:\u00a0Priorizar la silueta cuadrada y robusta, buscando el contraste del vidrio oscuro con el bloque de color crema/dorado.",
  "JW Blonde": "Forma: Rectangular, alta. Vidrio transparente, líquido ámbar.\nCRÍTICO: Franja diagonal AMARILLA cruzando la botella. Tapa azul. Es la única referencia con diagonal amarilla.",
  "Smirnoff Ice": "·\tFormato: Botella transparente pequeña, cuello largo. Altura aproximada 60% de una referencia de 1L.\n·\tEtiqueta: Centro blanco con detalles en rojo suave (no intenso).\n·\tContenido: Líquido transparente.\n·\tCRÍTICO: Priorizar el tamaño pequeño (es la botella más baja de la categoría) y el contraste de la etiqueta clara.",
  "Vodka Smirnoff 750mL": "·\tFormato:\u00a0Alta, cilíndrica, recta y muy esbelta. Altura equiparable a las botellas grandes de 1L del estante.\n·\tDetalles Visuales:\u00a0Líquido interno transparente. Tapa roja sólida y visible.\n·\tCRÍTICO:\u00a0Priorizar la silueta alargada transparente combinada con la tapa roja y el bloque rojo superior dentro de la etiqueta blanca."
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

// --- POSTGRES SETUP ---
let pgPool: ReturnType<typeof createPool> | null = null;
if (process.env.POSTGRES_URL) {
  pgPool = createPool({ connectionString: process.env.POSTGRES_URL });
  
  // Initialize table
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS audits (
      id BIGINT PRIMARY KEY,
      usuario TEXT,
      fecha TEXT,
      cliente TEXT,
      resultado_detallado TEXT,
      resultado_global TEXT,
      url_imagen TEXT,
      proceso_auditoria TEXT,
      manual_adjustments JSONB,
      observaciones TEXT
    );
  `).catch(err => console.error('Error creating PG table:', err));
}

// --- DB LOGIC (File-Based / Blob-Based) ---
const DB_FILE = path.join(process.cwd(), 'history.json');

let globalHistoryCache: AuditResult[] | null = null;

async function loadHistory(): Promise<AuditResult[]> {
  if (pgPool) {
     try {
       const { rows } = await pgPool.query('SELECT * FROM audits ORDER BY id DESC');
       return rows.map(r => ({
         ...r,
         id: Number(r.id), // Because BIGINT comes as string sometimes
       }));
     } catch (e) {
       console.error('Error loading history from Postgres:', e);
       return [];
     }
  }

  if (globalHistoryCache) {
    return globalHistoryCache;
  }
  
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const tokenParts = process.env.BLOB_READ_WRITE_TOKEN.split('_');
        if (tokenParts.length > 3) {
          const storeId = tokenParts[3].toLowerCase();
          const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/history.json`;
          console.log(`[loadHistory] Fetching directly: ${blobUrl}`);
          
          const response = await fetch(`${blobUrl}?download=1&t=${Date.now()}`, { cache: 'no-store' });
          if (response.ok) {
            const data = await response.text();
            globalHistoryCache = JSON.parse(data);
            return globalHistoryCache!;
          } else {
            console.warn(`[loadHistory] Failed to fetch Blob. Status: ${response.status}`);
          }
        }
      } catch (e) {
        console.error('Error loading history from Blob directly:', e);
      }
    }

    if (fs.existsSync(DB_FILE)) {
      console.log('Loading history from local file fallback.');
      const fileData = fs.readFileSync(DB_FILE, 'utf-8');
      try {
          globalHistoryCache = JSON.parse(fileData);
          return globalHistoryCache!;
      } catch(e) {}
    }
  } catch (e) {
    console.error('Error loading history:', e);
  }
  globalHistoryCache = [];
  return globalHistoryCache;
}

async function saveHistory(history: AuditResult[]) {
  if (pgPool) {
      // With Postgres, we usually save one by one. But this function might be used in fallback.
      // So let's skip complete overwrite for Postgres here, because saveToDb and deletes handle Postgres independently.
      return; 
  }

  globalHistoryCache = history;
  try {
    const data = JSON.stringify(history, null, 2);
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await put('history.json', data, {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true
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

async function getDb(): Promise<AuditResult[]> {
  return await loadHistory();
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  const newRecord = { ...audit, id: Date.now() };

  if (pgPool) {
     try {
       await pgPool.query(`
         INSERT INTO audits (id, usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen, proceso_auditoria, manual_adjustments, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       `, [
         newRecord.id,
         newRecord.usuario,
         newRecord.fecha,
         newRecord.cliente,
         newRecord.resultado_detallado,
         newRecord.resultado_global,
         newRecord.url_imagen,
         newRecord.proceso_auditoria,
         JSON.stringify(newRecord.manual_adjustments || []),
         newRecord.observaciones || ''
       ]);
       return newRecord;
     } catch (err) {
       console.error("Error inserting into PG:", err);
     }
  }

  // Fallback blob/file flow
  let currentHistory = await loadHistory();
  currentHistory.unshift(newRecord);
  await saveHistory(currentHistory);
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
    const { usuario, clienteId, isRescan, missingProducts, previousDetailedResult } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No photo uploaded' });

    // Step 1: Check Client Rules
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

    let requiredProducts = productColumns.filter(prod => clientRule[prod] === 'Si');
    
    const isRescanObj = isRescan === 'true';
    if (isRescanObj && missingProducts) {
      const missingList = missingProducts.split(',').filter(Boolean);
      requiredProducts = requiredProducts.filter(p => missingList.includes(p));
    }

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    let prompt = "";
    if (isRescanObj) {
      prompt = `
      Atención: Ya encontramos muchos productos, pero no logramos ver: ${requiredProducts.join(', ')}. 
      Ignora TODO lo demás en la góndola.
      Tu ÚNICA TAREA es analizar la imagen principal y examinar detalladamente la primera fila de la góndola. 
      IMPORTANTE: NO busques botellas ocultas, tapadas por otras, o ubicadas detrás. Limítate exclusivamente a los productos claramente visibles de frente en la primera fila.
      
      Busca exclusivamente: ${requiredProducts.join(', ')}.
      
      ═══════════════════════════════
      REGLAS DE IDENTIFICACIÓN
      ═══════════════════════════════
      - IMPORTANTE: Solo identifica productos que se encuentren en la primera fila de la góndola (visibles de frente). Ignora por completo botellas ocultas, tapadas por otras o en las filas de atrás.
      Basa la identificación PRINCIPALMENTE en características visuales:
      - Forma y silueta de la botella
      - Color del vidrio (transparente, verde oscuro, marrón oscuro, ámbar)
      - Colores dominantes de la etiqueta
      - Elementos distintivos: sellos, franjas, logos
      - Altura relativa comparada con otras botellas
      NO dependas únicamente de la lectura del texto de la etiqueta.
      - IMPORTANTE SOBRE REFERENCIAS INDIVIDUALES: Ten en cuenta que las imágenes de referencia individuales provistas son fotografías de estudio; los colores, brillos, reflejos en el vidrio, sombras y la nitidez de la etiqueta varían significativamente en la foto de la góndola real bajo la iluminación artificial del local y la perspectiva de la cámara.
      NO busques una coincidencia fotográfica exacta.
      
      ═══════════════════════════════
      FORMATO DE SALIDA
      ═══════════════════════════════
      Devolvé un objeto JSON donde las claves sean los nombres exactos de los productos buscados.
      Cada valor DEBE ser un objeto con:
      1. "status": "Present" (Presente) o "Missing" (Faltante)
      2. "reason": explicación breve citando las DOS características visuales 
         que confirmaron la presencia, o por qué no fue encontrado.

      DEVUELVE ÚNICA Y EXCLUSIVAMENTE EL OBJETO JSON. NO incluyas texto antes ni después, ni bloques de código markdown.

      Ejemplo:
      {
        "${requiredProducts[0] || 'Gin Gordons'}": {
          "status": "Present",
          "reason": "Botella transparente con franja amarilla + tapa violeta visible en estante del medio"
        }
      }
      `;
    } else {
      prompt = `
      Analyze this image of a liquor shelf.
      Check for the presence of the following products: ${requiredProducts.join(', ')}.
      
      ═══════════════════════════════
      REGLAS DE IDENTIFICACIÓN
      ═══════════════════════════════
      - IMPORTANTE: Solo identifica productos que se encuentren en la primera fila de la góndola (visibles de frente). Ignora por completo botellas ocultas, tapadas por otras o en las filas de atrás.
      Basa la identificación PRINCIPALMENTE en características visuales:
      - Forma y silueta de la botella
      - Color del vidrio (transparente, verde oscuro, marrón oscuro, ámbar)
      - Colores dominantes de la etiqueta
      - Elementos distintivos: sellos, franjas, logos
      - Altura relativa comparada con otras botellas
      NO dependas únicamente de la lectura del texto de la etiqueta.
      - IMPORTANTE SOBRE REFERENCIAS INDIVIDUALES: Ten en cuenta que las imágenes de referencia individuales provistas son fotografías de estudio; los colores, brillos, reflejos en el vidrio, sombras y la nitidez de la etiqueta varían significativamente en la foto de la góndola real bajo la iluminación artificial del local y la perspectiva de la cámara.
      NO busques una coincidencia fotográfica exacta.

      ═══════════════════════════════
      MÉTODO DE ANÁLISIS OBLIGATORIO
      ═══════════════════════════════

      PASO 1 — Divide la góndola en zonas horizontales
      Divide visualmente la imagen en zonas horizontales por estante (de arriba hacia abajo).
      Examina cada estante de forma independiente. Recorre la imagen de manera sistemática de arriba hacia abajo.
      NO analices toda la imagen de forma global al mismo tiempo.

      PASO 2 — Clasificá las botellas por color dominante PRIMERO
      Antes de identificar marcas, agrupá las botellas visibles por color de vidrio/líquido:
      □ Botellas de vidrio transparente
      □ Botellas de vidrio verde oscuro
      □ Botellas de vidrio marrón oscuro
      □ Botellas ámbar/naranja
      Esta pre-clasificación reduce el espacio de búsqueda para cada producto.

      PASO 3 — Detectá candidatos por estante
      En cada estante, identificá botellas que podrían coincidir visualmente 
      con los productos buscados.
      Para cada posible coincidencia, observá:
      - Forma general de la botella
      - Color dominante del vidrio
      - Colores de la etiqueta
      - Color de la tapa
      - Elementos distintivos (franjas, sellos, logos)
      - Altura relativa comparada con botellas de referencia de 1L

      PASO 4 — Validá las coincidencias (REGLA OBLIGATORIA)
      Solo confirmá un producto si AL MENOS DOS características visuales 
      coinciden con la descripción del producto.
      Ejemplos de coincidencias válidas:
      ✓ forma de botella + color de etiqueta
      ✓ color del vidrio + color de tapa
      ✓ forma + elemento distintivo (sello, franja)
      Una sola característica coincidente NO es suficiente para confirmar presencia.

      ═══════════════════════════════
      REFERENCIAS DE ESCALA
      ═══════════════════════════════
      Usá el tamaño relativo entre botellas para estimar el volumen:
      - Botellas 1L → las más altas (~30–32 cm de referencia)
      - Botellas 750ml → levemente más bajas que las de 1L
      - Botellas 200ml → aproximadamente el 50% de la altura de una botella de 1L
      - Botellas 275ml (Smirnoff Ice) → aproximadamente el 60% de una botella de 1L

      Esto es clave para diferenciar:
      - Vat 69 1L vs Vat 69 200ml (misma etiqueta, tamaño muy diferente)
      - White Horse 1L vs White Horse 200ml
      - Smirnoff Ice (275ml, botella tipo cerveza) vs botellas de tamaño completo

      ═══════════════════════════════
      FORMATO DE SALIDA
      ═══════════════════════════════
      Devolvé un objeto JSON donde las claves sean los nombres exactos de los productos buscados.
      Cada valor DEBE ser un objeto con:
      1. "status": "Present" (Presente) o "Missing" (Faltante)
      2. "reason": explicación breve citando las DOS características visuales 
         que confirmaron la presencia, o por qué no fue encontrado.

      DEVUELVE ÚNICA Y EXCLUSIVAMENTE EL OBJETO JSON. NO incluyas texto antes ni después, ni bloques de código markdown.

      Ejemplo:
      {
        "${requiredProducts[0] || 'Gin Gordons'}": {
          "status": "Present",
          "reason": "Botella transparente con franja amarilla + tapa violeta visible en estante del medio"
        },
        "${requiredProducts[1] || 'Vat 69 200ml'}": {
          "status": "Missing",
          "reason": "Solo se detectaron botellas Vat 69 1L de tamaño completo; no se encontró el formato de media altura"
        }
      }
      `;
    }

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } }
    ];

    // Step 2: Reference Images Analysis
    let missingRefs = 0;
    let referenceBlobs: any[] = [];
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const listResult = await list({ prefix: 'referencias/' });
        referenceBlobs = listResult.blobs;
      } catch (e) {
        console.warn("Failed to list reference blobs:", e);
      }
    }
    
    // NEW: Load Master Reference Image
    let masterRefData: string | null = null;
    try {
        const masterRefName = 'referencias_visuales.jpg';
        
        // Try Blob
        if (process.env.BLOB_READ_WRITE_TOKEN) {
             try {
                const blob = referenceBlobs.find(b => b.pathname.includes(masterRefName));
                if (blob) {
                    const fetchUrl = new URL(blob.url);
                    fetchUrl.searchParams.append('t', Date.now().toString());
                    const response = await fetch(fetchUrl.toString(), { cache: 'no-store' });
                    const arrayBuffer = await response.arrayBuffer();
                    masterRefData = Buffer.from(arrayBuffer).toString('base64');
                }
             } catch (e) {
                 console.warn("Failed to fetch blob for master ref:", e);
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
            parts.push({ text: `GUÍA MAESTRA DE REFERENCIAS EN GÓNDOLA (PARTE 1 DE 2).
En esta imagen:
Las flechas rojas y los nombres indican los productos objetivo.
El recuadro rojo delimita exactamente la botella que corresponde.
Solo las botellas que están dentro de los recuadros rojos deben utilizarse como referencia visual primaria ("la verdad absoluta") del producto en entorno de supermercado real.
Ignora el resto de productos no remarcados en esta foto.` });
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: masterRefData } });
        } else {
             // not found
        }
    } catch (e) {
        console.warn("Failed to load master reference:", e);
    }

    let masterRef2Data: string | null = null;
    // NEW: Load Master Reference Image 2
    try {
        const masterRef2Name = 'referencias_visuales2.jpg';
        
        // Try Blob
        if (process.env.BLOB_READ_WRITE_TOKEN) {
             try {
                const blob = referenceBlobs.find(b => b.pathname.includes(masterRef2Name) || b.pathname.includes('referencias_visuales2.jpeg'));
                if (blob) {
                    const fetchUrl = new URL(blob.url);
                    fetchUrl.searchParams.append('t', Date.now().toString());
                    const response = await fetch(fetchUrl.toString(), { cache: 'no-store' });
                    const arrayBuffer = await response.arrayBuffer();
                    masterRef2Data = Buffer.from(arrayBuffer).toString('base64');
                }
             } catch (e) {
                 console.warn("Failed to fetch blob for master ref 2:", e);
             }
        }

        // Try Local
        if (!masterRef2Data) {
             let refPath = getReferencePath(masterRef2Name);
             if (!fs.existsSync(refPath)) refPath = getReferencePath('referencias_visuales2.jpeg');
             if (fs.existsSync(refPath)) {
                masterRef2Data = fs.readFileSync(refPath).toString('base64');
             }
        }

        if (masterRef2Data) {
            parts.push({ text: `GUÍA MAESTRA DE REFERENCIAS EN GÓNDOLA (PARTE 2 DE 2).
Esta imagen complementa la anterior bajo las MISMAS REGLAS (flechas, recuadros rojos).
Instrucción Crítica: AMBAS imágenes (Parte 1 y Parte 2) contienen cómo se ven realmente los productos en la góndola, con la iluminación e imperfecciones reales del estante. PRIORIZA estas dos referencias visuales (los recuadros rojos) por sobre cualquier imagen individual de estudio (fondo blanco) que se provea más adelante.` });
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: masterRef2Data } });
        }
    } catch (e) {
        console.warn("Failed to load master reference 2:", e);
    }

    let loadedRefsCount = 0;
    const loadedRefsList: string[] = [];
    let injectedDescriptionsCount = 0;

    for (const prod of requiredProducts) {
      // 1. Add Visual Description if available
      if (PRODUCT_DESCRIPTIONS[prod]) {
        injectedDescriptionsCount++;
        parts.push({ text: `Visual description for ${prod}: ${PRODUCT_DESCRIPTIONS[prod]}` });
      }
      
      // 2. Add Reference Image
      try {
        let refData: string | null = null;
        const altFilenameBase = prod.replace(/[^a-zA-Z0-9]/g, ' ');

        if (process.env.BLOB_READ_WRITE_TOKEN) {
          // Try to find in Blob list (handling different extensions)
          const blob = referenceBlobs.find(b => {
             const lowerPath = b.pathname.toLowerCase();
             const lowerProd = prod.toLowerCase();
             const lowerAlt = altFilenameBase.toLowerCase();
             return (
               lowerPath.includes(`referencias/${lowerProd}.`) || 
               lowerPath.includes(`referencias/${lowerAlt}.`)
             );
          });
          if (blob) {
            const fetchUrl = new URL(blob.url);
            fetchUrl.searchParams.append('t', Date.now().toString());
            const response = await fetch(fetchUrl.toString(), { cache: 'no-store' });
            const arrayBuffer = await response.arrayBuffer();
            refData = Buffer.from(arrayBuffer).toString('base64');
          }
        } 
        
        // Fallback to local if not found in blob or no token
        if (!refData) {
           const refDir = path.join(process.cwd(), 'public', 'referencias');
           if (fs.existsSync(refDir)) {
               const files = fs.readdirSync(refDir);
               const matchedFile = files.find(f => {
                   const lowerF = f.toLowerCase();
                   const lowerProd = prod.toLowerCase();
                   const lowerAlt = altFilenameBase.toLowerCase();
                   return lowerF.startsWith(`${lowerProd}.`) || lowerF.startsWith(`${lowerAlt}.`);
               });
               if (matchedFile) {
                   refData = fs.readFileSync(path.join(refDir, matchedFile)).toString('base64');
               }
           }
        }

        if (refData) {
          parts.push({ text: `Imagen de estudio (fondo blanco) para ${prod}. ATENCIÓN: Esta es una imagen publicitaria. Usar solo para reconocer detalles de la etiqueta o el logo. Para determinar la forma, las proporciones reales y la iluminación, PRIORIZAR las dos imágenes de 'gíndolas reales' enviadas anteriormente, ya que así es como se ven realmente los productos en la góndola.` });
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: refData } });
          loadedRefsCount++;
          loadedRefsList.push(prod);
        } else {
             missingRefs++;
        }
      } catch (e) {
        console.warn(`Failed to load reference for ${prod}:`, e);
        missingRefs++;
      }
    }
    
    // Add the consolidated step log
    const masterActivaInfo = (masterRefData || masterRef2Data)
      ? 'ACTIVA (Solo Diccionario)'
      : 'NO ENCONTRADA';

    processLog.push({ 
        step: 'Carga de Imágenes de Referencia', 
        status: missingRefs === 0 ? 'OK' : 'Warning', 
        details: `Cargadas: ${loadedRefsCount}, Faltantes: ${missingRefs}. Productos cargados: ${loadedRefsList.length > 0 ? loadedRefsList.join(', ') : 'Ninguno'}. Productos en góndola (fotos maestras): ${masterActivaInfo}`
    });

    processLog.push({ 
        step: 'Inyección de Descripciones Visuales (Texto)', 
        status: injectedDescriptionsCount > 0 ? 'OK' : 'Warning', 
        details: `Inyectadas correctamente: ${injectedDescriptionsCount} descripciones. Esto ayuda al modelo a identificar la forma, tapa y color de los productos.`
    });

    processLog.push({ 
        step: 'Revisión de contexto importante', 
        status: 'OK', 
        details: 'Prompt y descripciones visuales inyectadas correctamente'
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

    let prevResultsMap: Record<string, any> = {};
    if (isRescanObj && previousDetailedResult) {
      try {
        const prevArr = JSON.parse(previousDetailedResult);
        if (Array.isArray(prevArr)) {
          prevArr.forEach((pr: any) => {
            prevResultsMap[pr.productName] = pr;
          });
        }
      } catch (e) {
        console.error("Failed to parse previousDetailedResult", e);
      }
    }

    productColumns.forEach(prod => {
      const isRequired = clientRule[prod] === 'Si';
      
      let isPresent = false;
      let reason = 'No reason provided';
      
      const resultData = analysisResult[prod];

      if (!isRequired) {
          reason = 'No auditado (No requerido por el cliente)';
      } else if (resultData) {
        // AI evaluated this product (either it was missing and we rescanned, or initial scan)
        if (typeof resultData === 'object') {
          isPresent = resultData.status === 'Present';
          reason = resultData.reason || 'No reason text in object';
        } else if (typeof resultData === 'string') {
          isPresent = resultData === 'Present';
          reason = 'AI returned legacy string format'; 
        }
      } else if (isRescanObj && prevResultsMap[prod]) {
        // AI didn't evaluate it because it wasn't requested in rescan, keep previous result!
        isPresent = prevResultsMap[prod].present;
        reason = prevResultsMap[prod].reason || 'Mantenido de auditoría anterior';
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

    console.log('Returning audit with process log length:', processLog.length); // DEBUG

    res.json({ globalResult, detailedResult, fileUrl, processLog });

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

    let currentHistory = await loadHistory();
    const audit = currentHistory.find(a => a.id === id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    // Initialize array if it doesn't exist
    if (!audit.manual_adjustments) {
      audit.manual_adjustments = [];
    }
    else if (typeof audit.manual_adjustments === 'string') {
        try {
            audit.manual_adjustments = JSON.parse(audit.manual_adjustments);
        } catch(e) {
            audit.manual_adjustments = [];
        }
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

    if (pgPool) {
       await pgPool.query('UPDATE audits SET manual_adjustments = $1 WHERE id = $2', [
           JSON.stringify(audit.manual_adjustments),
           id
       ]);
    } else {
       await saveHistory(currentHistory);
    }

    res.json({ success: true, audit });
  } catch (error: any) {
    console.error('Adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust audit' });
  }
};

app.post('/api/audit/:id/adjust', express.json(), adjustAuditHandler);
app.patch('/api/audit/:id/adjust', express.json(), adjustAuditHandler);

app.post('/api/save-audit', express.json(), async (req, res) => {
  try {
    const { usuario, cliente, fecha, resultado_detallado, resultado_global, url_imagen, proceso_auditoria, manual_adjustments, observaciones } = req.body;
    
    await saveToDb({
      usuario,
      fecha: fecha || new Date().toISOString(),
      cliente,
      resultado_detallado: typeof resultado_detallado === 'string' ? resultado_detallado : JSON.stringify(resultado_detallado),
      resultado_global,
      url_imagen,
      proceso_auditoria: typeof proceso_auditoria === 'string' ? proceso_auditoria : JSON.stringify(proceso_auditoria),
      manual_adjustments,
      observaciones
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Save audit error:', error);
    res.status(500).json({ error: 'Failed to save audit', details: error.message });
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

app.get('/api/check-env', (req, res) => {
  res.json({ BLOB_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN });
});


app.post('/api/history/delete', express.json(), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }
    
    if (pgPool) {
       for (const id of ids) {
           await pgPool.query('DELETE FROM audits WHERE id = $1', [id]);
       }
    } else {
       let currentHistory = await loadHistory();
       currentHistory = currentHistory.filter(record => !ids.includes(record.id));
       await saveHistory(currentHistory);
    }
    
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
