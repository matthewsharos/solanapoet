const axios = require('axios');

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Serverless function for fetching NFT data from Helius
module.exports = async (req, res) => {
  console.log('[serverless] NFT endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(200).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    console.log('[serverless] Extracting mint address...');
    const { mintAddress } = req.query;
    
    if (!mintAddress) {
      console.log('[serverless] No mint address provided');
      return res.status(200).json({
        success: false,
        message: 'No mint address provided'
      });
    }

    console.log(`[serverless] Fetching NFT data for ${mintAddress}`);
    
    // Get Helius API key
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    if (!HELIUS_API_KEY) {
      console.error('[serverless] Helius API key not found');
      return res.status(200).json({
        success: false,
        message: 'Helius API key not configured'
      });
    }

    // Construct Helius API URL
    const HELIUS_API_URL = `https://api.helius.xyz/v0/tokens/metadata?api-key=${HELIUS_API_KEY}`;

    // Prepare request body
    const requestBody = {
      mintAccounts: [mintAddress],
      includeOffChain: true,
      disableCache: false
    };

    console.log('[serverless] Making request to Helius API...');
    
    // Make request to Helius API
    const response = await fetch(HELIUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`[serverless] Helius API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('[serverless] Error details:', errorText);
      
      return res.status(200).json({
        success: false,
        message: `Helius API error: ${response.status} ${response.statusText}`,
        error: errorText
      });
    }

    const data = await response.json();
    console.log('[serverless] Successfully fetched NFT data');

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log('[serverless] No NFT data found');
      return res.status(200).json({
        success: false,
        message: 'No NFT data found'
      });
    }

    // Return the NFT data
    return res.status(200).json({
      success: true,
      nft: data[0]
    });

  } catch (error) {
    console.error('[serverless] Error in NFT endpoint:', error);
    
    return res.status(200).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      error: {
        stack: error instanceof Error ? error.stack : null,
        vercelEnv: process.env.VERCEL_ENV || 'unknown',
        nodeVersion: process.version,
        platform: process.platform
      }
    });
  }
}; 