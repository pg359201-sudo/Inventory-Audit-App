import express from 'express';
// Removed static vite import to prevent production crashes
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { GoogleGenAI } from '@google/genai';
import { initDb, saveAudit, getHistory } from './db';
import { saveFile } from './storage';
import { fileURLToPath } from 'url';

// Initialize DB safely
try {
  initDb();
} catch (error) {
  console.error('Failed to initialize database:', error);
  // Continue execution to allow other endpoints to work
}

const app = express();

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

// Helper to get absolute path that works in both local and Vercel
function getDataPath(relativePath: string): string {
  // Try process.cwd() first (standard Vercel/Local root)
  let absolutePath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }
  
  // Try relative to __dirname (fallback for some bundled environments)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  absolutePath = path.resolve(__dirname, '..', relativePath); // Assuming src/app.ts, so go up one level
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  // Try relative to 'public' if it's a reference image (Vercel sometimes puts public at root)
  if (relativePath.startsWith('public/')) {
     // Try standard public location
     absolutePath = path.join(process.cwd(), 'public', relativePath.replace('public/', ''));
     if (fs.existsSync(absolutePath)) return absolutePath;
     
     // Try one level up (if cwd is api/)
     absolutePath = path.join(process.cwd(), '..', relativePath); 
     if (fs.existsSync(absolutePath)) return absolutePath;
  }

  console.warn(`Warning: File not found at ${relativePath}. Checked: ${path.join(process.cwd(), relativePath)}`);
  return path.join(process.cwd(), relativePath); // Return default to let it fail with clear error
}

// Configure Multer for memory storage (needed for Vercel Blob)
const upload = multer({ storage: multer.memoryStorage() });

// Serve uploaded files (only for local dev)
if (process.env.VERCEL !== '1') {
  app.use('/uploads', express.static(path.resolve('uploads')));
}

// API Routes

// Debug Endpoint
app.get('/api/debug-paths', (req, res) => {
  const cwd = process.cwd();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  
  const pathsToCheck = [
    'data/reglas-clientes.csv',
    'public/referencias',
    '../data/reglas-clientes.csv',
    '../public/referencias'
  ];

  const results = pathsToCheck.map(p => ({
    path: p,
    absolute: path.resolve(cwd, p),
    exists: fs.existsSync(path.resolve(cwd, p))
  }));

  res.json({
    cwd,
    __dirname,
    results,
    env: process.env
  });
});

// Get Clients
app.get('/api/clients', (req, res) => {
  try {
    let fileContent = EMBEDDED_CSV_DATA;
    const csvPath = getDataPath('data/reglas-clientes.csv');
    
    // Try to read from file if it exists, otherwise use embedded
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
    // Fallback to embedded data even on error
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

// Submit Audit
app.post('/api/audit', upload.single('photo'), async (req, res) => {
  try {
    const { usuario, clienteId, clienteNombre } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    // 1. Load Client Rules
    let fileContent = EMBEDDED_CSV_DATA;
    const csvPath = getDataPath('data/reglas-clientes.csv');
    if (fs.existsSync(csvPath)) {
      fileContent = fs.readFileSync(csvPath, 'utf-8');
    }
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    // Find client by Codigo FEMSA (assuming clienteId is the code)
    const clientRule = records.find((r: any) => r['Codigo FEMSA'] === clienteId);
    
    if (!clientRule) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // 2. Identify required products
    const productColumns = [
      "Gin Gordons", "Gin Tanqueray", "Gin Royale", "Gin Sevilla", 
      "JW Blonde", "Smirnoff Ice", "Vodka Smirnoff 750mL", 
      "Black & White 1L", "JW Black 1L", "JW Red 1L", 
      "Sandy Mac 1L", "Vat 69 1L", "Vat 69 200 ml", "White Horse 1L"
    ];

    const requiredProducts = productColumns.filter(prod => clientRule[prod] === 'Si');

    // 3. Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Prepare prompt
    const prompt = `
      Analyze this image of a liquor shelf (the first image provided).
      Check for the presence of the following products: ${productColumns.join(', ')}.
      
      I have provided reference images for the required products below the main audit photo.
      Use these references to strictly identify the products.
      
      For each product, determine if it is present or missing.
      Return a JSON object where keys are the product names and values are "Present" or "Missing".
      
      Example output format:
      {
        "Gin Gordons": "Present",
        "Gin Tanqueray": "Missing"
      }
      
      ONLY return the JSON. Do not include markdown formatting.
    `;

    // Read file buffer (from memory)
    const imageBase64 = file.buffer.toString('base64');

    // Build parts array with main image and references
    const parts: any[] = [
      { text: prompt },
      { text: "Main Audit Photo:" },
      {
        inlineData: {
          mimeType: file.mimetype,
          data: imageBase64
        }
      }
    ];

    // Add reference images if they exist
    let referencesFound = 0;
    for (const prod of requiredProducts) {
      // Try exact match first
      let refPath = getDataPath(`public/referencias/${prod}.jpg`);
      
      // Try with sanitized name if exact match fails (optional safety)
      if (!fs.existsSync(refPath)) {
         refPath = getDataPath(`public/referencias/${prod.replace(/[^a-zA-Z0-9]/g, ' ')}.jpg`);
      }

      if (fs.existsSync(refPath)) {
        const refBuffer = fs.readFileSync(refPath);
        parts.push({ text: `Reference for ${prod}:` });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: refBuffer.toString('base64')
          }
        });
        referencesFound++;
      }
    }
    
    console.log(`Sending request to Gemini with ${referencesFound} reference images.`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: {
        parts: parts
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini");
    }

    // Clean up markdown code blocks if present
    const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    let analysisResult;
    try {
      analysisResult = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse Gemini response:", responseText);
      return res.status(500).json({ error: "AI analysis failed to return valid JSON" });
    }

    // 4. Evaluate Global Result
    let globalResult = 'OK';
    const detailedResult: any[] = [];

    productColumns.forEach(prod => {
      const isRequired = clientRule[prod] === 'Si';
      const isPresent = analysisResult[prod] === 'Present';
      
      detailedResult.push({
        productName: prod,
        required: isRequired,
        present: isPresent,
        status: isPresent ? 'Present' : 'Missing'
      });

      if (isRequired && !isPresent) {
        globalResult = 'Falta Referencia';
      }
    });

    // 5. Rename and Save File
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeClientName = (clientRule['Nombre Store'] || 'Client').replace(/[^a-z0-9]/gi, '_');
    const newFilename = `${safeClientName}_${timestamp}_${globalResult.replace(' ', '_')}.jpg`;
    
    const fileUrl = await saveFile(file, newFilename);

    // 6. Save to DB
    await saveAudit({
      usuario,
      fecha: new Date().toISOString(),
      cliente: clientRule['Nombre Store'],
      resultado_detallado: JSON.stringify(detailedResult),
      resultado_global: globalResult,
      url_imagen: fileUrl
    });

    res.json({
      globalResult,
      detailedResult,
      fileUrl
    });

  } catch (error) {
    console.error('Audit processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get History
app.get('/api/history', async (req, res) => {
  try {
    const rows = await getHistory();
    res.json(rows);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Vite Middleware (only for local dev)
if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
  // Use dynamic import for vite to avoid build issues in production
  import('vite').then(async (viteModule) => {
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }).catch(err => console.error('Failed to load vite', err));
}

export default app;
