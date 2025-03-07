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
        message: 'Helius API key not configured',
        debug: {
          hasHeliusKey: false,
          environment: process.env.NODE_ENV,
          vercelEnv: process.env.VERCEL_ENV
        }
      });
    }

    // Construct Helius RPC API URL
    const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    // Prepare RPC request body
    const requestBody = {
      jsonrpc: "2.0",
      id: "helius-fetch",
      method: "getAsset",
      params: {
        id: mintAddress
      }
    };

    console.log('[serverless] Making request to Helius RPC API...');
    
    // Make request to Helius API using axios
    const response = await axios.post(HELIUS_RPC_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = response.data;
    console.log('[serverless] Successfully fetched NFT data');

    if (!data || !data.result) {
      console.log('[serverless] No NFT data found');
      return res.status(200).json({
        success: false,
        message: 'No NFT data found',
        debug: {
          mintAddress,
          hasHeliusKey: true,
          environment: process.env.NODE_ENV,
          vercelEnv: process.env.VERCEL_ENV,
          response: data
        }
      });
    }

    const nftData = data.result;

    // Process the NFT data
    const processedData = {
      mint: mintAddress,
      name: nftData.content?.metadata?.name || nftData.name || 'Unknown NFT',
      description: nftData.content?.metadata?.description || nftData.description || '',
      image: nftData.content?.files?.[0]?.uri || 
             nftData.content?.links?.image || 
             nftData.image || 
             'https://placehold.co/600x400?text=Image+Not+Available',
      owner: typeof nftData.ownership?.owner === 'string' 
        ? { publicKey: nftData.ownership.owner }
        : { publicKey: nftData.ownership?.owner?.address || '' },
      attributes: nftData.content?.metadata?.attributes || [],
      collection: nftData.grouping?.find(g => g.group_key === 'collection')?.group_value || null,
      creators: nftData.creators || [],
      royalty: nftData.royalty || null,
      tokenStandard: nftData.interface || null
    };

    // Return the processed NFT data
    return res.status(200).json({
      success: true,
      nft: processedData
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
        platform: process.platform,
        mintAddress: req.query?.mintAddress,
        hasHeliusKey: !!process.env.HELIUS_API_KEY,
        response: error.response?.data
      }
    });
  }
}; 