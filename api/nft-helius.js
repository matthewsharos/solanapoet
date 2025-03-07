const axios = require('axios');

// Serverless handler for general NFT Helius API
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Create a response for invalid routes
  return res.status(200).json({
    success: true,
    message: 'NFT Helius API endpoint is working',
    usage: {
      fetchNFT: '/api/nft/helius/[mintAddress]'
    },
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      heliusApiConfigured: !!process.env.HELIUS_API_KEY
    }
  });
}; 