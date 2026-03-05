import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

const isVercel = process.env.VERCEL === '1';

export async function saveFile(file: Express.Multer.File, filename: string): Promise<string> {
  if (isVercel) {
    // Upload to Vercel Blob
    const blob = await put(filename, file.buffer, {
      access: 'public',
    });
    return blob.url;
  } else {
    // Save to local filesystem
    const uploadDir = path.resolve('uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    return `/uploads/${filename}`;
  }
}
