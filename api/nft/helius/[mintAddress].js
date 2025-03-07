import axios from 'axios';

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Serverless function for fetching NFT data from Helius
export default async function handler(req, res) {
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
    return res.status(400).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    console.log('[serverless] Extracting mint address...');
    const { mintAddress } = req.query;
    
    if (!mintAddress) {
      console.log('[serverless] No mint address provided');
      return res.status(400).json({
        success: false,
        message: 'No mint address provided'
      });
    }

    console.log(`[serverless] Fetching NFT data for ${mintAddress}`);
    
    // Get Helius API key
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    
    if (!HELIUS_API_KEY) {
      console.error('[serverless] Helius API key not found');
      return res.status(500).json({
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

    // Log request details (safely)
    console.log('[serverless] Making request with details:', {
      mintAddress,
      hasHeliusKey: true,
      heliusKeyLength: HELIUS_API_KEY.length,
      heliusKeyStart: HELIUS_API_KEY.substring(0, 4) + '...',
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    });

    // Prepare RPC request body for getAsset
    const requestBody = {
      jsonrpc: "2.0",
      id: "helius-fetch",
      method: "getAsset",
      params: {
        id: mintAddress
      }
    };

    console.log('[serverless] Making request to Helius RPC API...');
    
    // Define a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 15 seconds')), 15000);
    });

    // Define the fetch promise
    const fetchPromise = axios.post(HELIUS_RPC_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 second timeout
    });

    // Race the fetch against the timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    const data = response.data;
    console.log('[serverless] Successfully fetched NFT data from Helius');

    if (!data || !data.result) {
      console.error('[serverless] No NFT data found in response:', data);
      return res.status(404).json({
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
    
    // Determine appropriate status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.response) {
      statusCode = error.response.status;
      errorMessage = `Helius API error: ${error.response.status}`;
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      statusCode = 504;
      errorMessage = 'Request timed out';
    } else if (error.code === 'ERR_BAD_REQUEST') {
      statusCode = 400;
      errorMessage = 'Bad request to Helius API';
    }
    
    // Return detailed error information
    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: {
        type: error.name || 'Error',
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN',
        mintAddress: req.query?.mintAddress
      }
    });
  }
} 