// Serverless function handler for diagnostics
module.exports = (req, res) => {
  res.json({
    success: true,
    message: 'Debug endpoint is working',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      vercel_env: process.env.VERCEL_ENV,
      helius_key_available: !!process.env.HELIUS_API_KEY,
      vite_helius_key_available: !!process.env.VITE_HELIUS_API_KEY
    },
    request: {
      url: req.url,
      method: req.method,
      headers: req.headers
    }
  });
}; 