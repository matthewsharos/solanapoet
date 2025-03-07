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
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { mintAddress } = req.query;
    console.log('Fetching NFT data for mint address:', mintAddress);

    if (!mintAddress) {
      return res.status(400).json({ success: false, message: 'Missing mint address' });
    }

    if (!process.env.HELIUS_API_KEY) {
      return res.status(500).json({ success: false, message: 'Helius API key not configured' });
    }

    // Call Helius RPC API
    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=' + process.env.HELIUS_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAsset',
        params: {
          id: mintAddress,
        },
      }),
      timeout: 15000, // 15 second timeout
    });

    if (!response.ok) {
      console.error('Helius API error:', {
        status: response.status,
        statusText: response.statusText
      });
      return res.status(response.status).json({ 
        success: false, 
        message: `Helius API error: ${response.statusText}` 
      });
    }

    const data = await response.json();
    console.log('Helius API response:', data);

    if (data.error) {
      console.error('Helius API returned error:', data.error);
      return res.status(400).json({ 
        success: false, 
        message: data.error.message || 'Helius API error' 
      });
    }

    // Extract relevant NFT data from Helius response
    const nftData = {
      mint: mintAddress,
      name: data.result.content?.metadata?.name || 'Unknown',
      description: data.result.content?.metadata?.description || '',
      image: data.result.content?.files?.[0]?.uri || data.result.content?.metadata?.image || '',
      attributes: data.result.content?.metadata?.attributes || [],
      owner: data.result.ownership?.owner || '',
      collection: data.result.grouping?.collection 
        ? {
            name: data.result.grouping.collection.name || '',
            address: data.result.grouping.collection.key || ''
          }
        : null,
      creators: data.result.creators || [],
      royalty: data.result.royalty,
      tokenStandard: data.result.interface
    };

    console.log('Processed NFT data:', nftData);

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