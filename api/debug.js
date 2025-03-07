// Serverless function handler for diagnostics
module.exports = (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Return diagnostic information
    res.status(200).json({
      success: true,
      message: 'Debug endpoint is working',
      timestamp: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV,
        vercel: process.env.VERCEL,
        vercel_env: process.env.VERCEL_ENV,
        helius_key_available: !!process.env.HELIUS_API_KEY,
        vite_helius_key_available: !!process.env.VITE_HELIUS_API_KEY,
        node_version: process.version
      },
      request: {
        url: req.url,
        method: req.method,
        headers: req.headers
      }
    });
  } catch (error) {
    console.error('[serverless] Error in debug endpoint:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error in debug endpoint',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}; 