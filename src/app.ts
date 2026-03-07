import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
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
}

// --- PRODUCT DESCRIPTIONS ---
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "Gin Gordons": "Botella transparente con líquido transparente. Su etiqueta tiene letras color rojo, en su parte inferior una franja amarilla y más abajo una delgada franja violeta. En su tapa superior predomina el color violeta.",
  "White Horse 1L": "Diferencial clave: Tapa negra. Botella cilíndrica con líquido ámbar. Ancla visual: etiqueta muy grande amarilla brillante con letras rojas diagonales.",
  "Vat 69 200 ml": "Diferencial clave: Tapa negra con una leve franja amarilla en la parte superior. Botella tipo petaca pequeña, verde oscuro y de forma plana. Su altura es casi la mitad de una botella de 1L (como 'JW Black'). Etiqueta negra con franjas amarillas muy marcadas arriba y abajo; las letras del logo son blancas con un leve ángulo de 20 grados aproximadamente.",
  "Smirnoff Ice": "Diferencial clave: Tapa roja fina. Botella transparente pequeña. Ancla visual: líquido interior color blanco turbio. Etiqueta blanca con detalles rojos."
};

// --- CONFIG ---
const app = express();
const isVercel = process.env.VERCEL === '1';

// --- DB LOGIC (In-Memory) ---
const globalHistory: AuditResult[] = [];

async function getDb(): Promise<AuditResult[]> {
  return globalHistory;
}

async function saveToDb(audit: Omit<AuditResult, 'id'>) {
  const newRecord = { ...audit, id: Date.now() };
  globalHistory.unshift(newRecord);
  return newRecord;
}

import { put, list } from '@vercel/blob';

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
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Fallback to local if no token (dev mode without blob)
      const referencesDir = path.join(process.cwd(), 'public', 'referencias');
      if (!fs.existsSync(referencesDir)) {
        return res.json({ count: 0, source: 'local' });
      }
      const files = fs.readdirSync(referencesDir).filter(file => {
        return !file.startsWith('.') && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
      });
      return res.json({ count: files.length, source: 'local' });
    }

    const { blobs } = await list({ prefix: 'referencias/' });
    res.json({ count: blobs.length, source: 'blob' });
  } catch (error) {
    console.error('Error counting references:', error);
    res.status(500).json({ error: 'Failed to count references' });
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

    // Step 2: Reference Images Analysis
    let missingRefs = 0;
    // ... (reference loading logic) ...
    // I need to capture the reference loading logic to update the log status properly.
    // I will rewrite the reference loading block to track success/failure.

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
      Analyze this image of a liquor shelf.
      Check ONLY for the following REQUIRED products: ${requiredProducts.join(', ')}.
      
      You MUST return a JSON object where the keys are the exact product names.
      The value for each key MUST be an object with two fields:
      1. "status": either "Present" or "Missing".
      2. "reason": a short explanation (string) of why you determined this status.

      Example Output:
      {
        "Gin Gordons": { "status": "Present", "reason": "Red label bottle visible on top shelf" },
        "Gin Royale": { "status": "Missing", "reason": "No purple bottle found" }
      }
    `;

    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } }
    ];

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
