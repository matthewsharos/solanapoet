// Simple server to serve the test form (CommonJS version)
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3005;

// Serve the test form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-form.html'));
});

app.listen(PORT, () => {
  console.log(`Test form server running at http://localhost:${PORT}`);
}); 