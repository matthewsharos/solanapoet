import axios from 'axios';

// Serverless function for fetching collection data from Helius
export default async function handler(req, res) {
  console.log('[serverless] Collection endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    const { collectionId, page = 1 } = req.body;
    
    if (!collectionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Collection ID is required' 
      });
    }

    console.log(`Fetching collection data for ID: ${collectionId}, page: ${page}`);

    // Using exact working format with limit:1 that we know works
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: collectionId,
          page: Number(page),
          limit: 1  // Critical: Keep limit as 1, as we discovered this is required
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data?.error) {
      console.error('Helius API error:', response.data.error);
      return res.status(400).json({
        success: false,
        message: 'Helius API error',
        error: response.data.error
      });
    }

    console.log('Successfully fetched collection data');
    return res.status(200).json({
      success: true,
      result: response.data.result
    });

  } catch (error) {
    console.error('Collection fetch error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collection NFTs',
      error: error.message
    });
  }
} 