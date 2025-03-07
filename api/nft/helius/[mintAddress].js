import axios from 'axios';

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Serverless function for fetching NFT data from Helius
export default async function handler(req, res) {
  console.log('[serverless] NFT endpoint called with query:', req.query);
  
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
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { mintAddress } = req.query;
    console.log('Fetching NFT data for mint address:', mintAddress);

    if (!mintAddress) {
      return res.status(400).json({ success: false, message: 'Missing mint address' });
    }

    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      return res.status(500).json({ success: false, message: 'Helius API key not configured' });
    }

    // Call Helius RPC API using axios
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAsset',
        params: {
          id: mintAddress,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000 // 15 second timeout
      }
    );

    // Log a truncated version of the response for debugging
    console.log('Helius API response (truncated):', 
      JSON.stringify(response.data).substring(0, 500) + '...');

    if (response.data.error) {
      console.error('Helius API returned error:', response.data.error);
      return res.status(400).json({ 
        success: false, 
        message: response.data.error.message || 'Helius API error' 
      });
    }

    if (!response.data.result) {
      console.error('Helius API returned no result');
      return res.status(404).json({
        success: false,
        message: 'NFT not found'
      });
    }

    // Extract relevant NFT data from Helius response
    const nftData = {
      mint: mintAddress,
      name: response.data.result.content?.metadata?.name || 'Unknown',
      description: response.data.result.content?.metadata?.description || '',
      image: response.data.result.content?.files?.[0]?.uri || 
             response.data.result.content?.metadata?.image || '',
      attributes: response.data.result.content?.metadata?.attributes || [],
      owner: response.data.result.ownership?.owner || '',
      collection: response.data.result.grouping?.collection 
        ? {
            name: response.data.result.grouping.collection.name || '',
            address: response.data.result.grouping.collection.key || ''
          }
        : null,
      creators: response.data.result.creators || [],
      royalty: response.data.result.royalty,
      tokenStandard: response.data.result.interface
    };

    console.log('Processed NFT data for', mintAddress);

    return res.status(200).json({
      success: true,
      nft: nftData
    });
  } catch (error) {
    console.error('Error in Helius API handler:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
} 