import app from './src/app';
import { fileURLToPath } from 'url';

const PORT = 3000;

// Start server only if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
