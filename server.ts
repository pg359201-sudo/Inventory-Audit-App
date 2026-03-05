import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { GoogleGenAI } from '@google/genai';
import db, { initDb } from './src/db.ts';

// Initialize DB
initDb();

const app = express();
const PORT = 3000;

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve('uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Filename format: {NombreCliente}_{Fecha-Hora}_{ResultadoGlobal}.jpg
    // We will rename it properly AFTER processing, for now use temp name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Serve uploaded files
app.use('/uploads', express.static(path.resolve('uploads')));

// API Routes

// Get Clients
app.get('/api/clients', (req, res) => {
  try {
    const csvPath = path.resolve('data/reglas-clientes.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    res.json(records);
  } catch (error) {
    console.error('Error reading CSV:', error);
    res.status(500).json({ error: 'Failed to load client data' });
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
    const csvPath = path.resolve('data/reglas-clientes.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
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

    // Read file as base64
    const imageBuffer = fs.readFileSync(file.path);
    const imageBase64 = imageBuffer.toString('base64');

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
      let refPath = path.resolve('public/referencias', `${prod}.jpg`);
      
      // Try with sanitized name if exact match fails (optional safety)
      if (!fs.existsSync(refPath)) {
         refPath = path.resolve('public/referencias', `${prod.replace(/[^a-zA-Z0-9]/g, ' ')}.jpg`);
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
    const newPath = path.join(path.dirname(file.path), newFilename);
    
    fs.renameSync(file.path, newPath);
    const fileUrl = `/uploads/${newFilename}`;

    // 6. Save to DB
    const insert = db.prepare(`
      INSERT INTO audits (usuario, fecha, cliente, resultado_detallado, resultado_global, url_imagen)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insert.run(
      usuario,
      new Date().toISOString(),
      clientRule['Nombre Store'],
      JSON.stringify(detailedResult),
      globalResult,
      fileUrl
    );

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
app.get('/api/history', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM audits ORDER BY id DESC');
    const rows = stmt.all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Vite Middleware
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
