import axios from 'axios';

// Serverless function for fetching collection assets
export default async function handler(req, res) {
  console.log('[serverless] Collection assets endpoint called with query:', req.query);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get query parameters
    const { collectionId, page = 1, limit = 10 } = req.query;
    
    if (!collectionId) {
      return res.status(400).json({
        success: false,
        message: 'Collection ID is required'
      });
    }
    
    console.log(`Fetching assets for collection: ${collectionId}, page: ${page}, limit: ${limit}`);
    
    // Get Helius API key from environment variables
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }
    
    // Use Helius RPC to get assets by group (collection)
    const heliusResponse = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: "2.0",
        id: "collection-assets",
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: collectionId,
          page: parseInt(page),
          limit: parseInt(limit)
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    
    // Check if the response contains the expected data
    if (!heliusResponse.data || !heliusResponse.data.result) {
      console.error('Unexpected Helius response:', heliusResponse.data);
      throw new Error('Unexpected response from Helius API');
    }
    
    const assets = heliusResponse.data.result.items || [];
    const total = heliusResponse.data.result.total || 0;
    
    console.log(`Found ${assets.length} assets for collection ${collectionId} (total: ${total})`);
    
    // Return the assets
    return res.status(200).json({
      success: true,
      data: {
        items: assets,
        total: total,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Collection assets endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collection assets',
      error: error.message
    });
  }
} 