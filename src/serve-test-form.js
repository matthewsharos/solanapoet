// Simple server to serve the test form
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3005;

// Serve the test form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-form.html'));
});

app.listen(PORT, () => {
  console.log(`Test form server running at http://localhost:${PORT}`);
}); 