const axios = require('axios');

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch NFT data from Helius with retries
const fetchHeliusData = async (mintAddress, retries = 3) => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    console.log(`[serverless] Using Helius API key (prefix: ${heliusApiKey.substring(0, 4)}...)`);

    // Create an axios instance with timeout
    const heliusClient = axios.create({
      timeout: 10000 // 10 second timeout
    });

    // First try the RPC API
    console.log(`[serverless] Attempting RPC API for NFT: ${mintAddress}`);
    try {
      const rpcResponse = await heliusClient.post(
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        {
          jsonrpc: "2.0",
          id: "helius-fetch",
          method: "getAsset",
          params: {
            id: mintAddress
          }
        }
      );
      
      if (rpcResponse.data.result) {
        console.log(`[serverless] RPC API success for ${mintAddress}`);
        return rpcResponse.data.result;
      }
    } catch (error) {
      console.error(`[serverless] RPC API error: ${error.message}`);
    }

    // If RPC API fails, try the metadata API
    console.log(`[serverless] Attempting metadata API for NFT: ${mintAddress}`);
    try {
      const metadataResponse = await heliusClient.post(
        `https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`,
        {
          mintAccounts: [mintAddress]
        }
      );
      
      if (metadataResponse.data.data && metadataResponse.data.data[0]) {
        console.log(`[serverless] Metadata API success for ${mintAddress}`);
        return metadataResponse.data.data[0];
      } else {
        console.log(`[serverless] Metadata API returned no data for ${mintAddress}`);
        throw new Error('No metadata found from metadata API');
      }
    } catch (error) {
      console.error(`[serverless] Metadata API error: ${error.message}`);
      throw error;
    }
  } catch (error) {
    console.error(`[serverless] Overall error for ${mintAddress}: ${error.message}`);
    
    if (retries > 0) {
      const delayTime = Math.pow(2, 3 - retries) * 1000; // Exponential backoff
      console.log(`[serverless] Retrying in ${delayTime}ms (${retries} retries left)`);
      await delay(delayTime);
      return fetchHeliusData(mintAddress, retries - 1);
    }
    
    throw error;
  }
};

// Serverless function handler
module.exports = async (req, res) => {
  const { mintAddress } = req.query;
  
  console.log(`[serverless] NFT Helius endpoint called for: ${mintAddress}`);
  console.log(`[serverless] Request method: ${req.method}`);
  console.log(`[serverless] Request URL: ${req.url}`);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed',
      error: 'METHOD_NOT_ALLOWED'
    });
  }
  
  if (!mintAddress) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing mint address', 
      error: 'MISSING_MINT_ADDRESS'
    });
  }
  
  try {
    // Debug environment variables
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    console.log(`[serverless] Helius API key available: ${!!heliusApiKey}`);
    if (heliusApiKey) {
      console.log(`[serverless] API key prefix: ${heliusApiKey.substring(0, 4)}... (length: ${heliusApiKey.length})`);
    }
    
    if (!heliusApiKey) {
      console.error('[serverless] ERROR: Helius API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Helius API key not configured',
        error: 'MISSING_API_KEY'
      });
    }
    
    // Fetch data from Helius
    console.log('[serverless] Fetching data from Helius');
    const nftData = await fetchHeliusData(mintAddress);
    
    if (!nftData) {
      console.error('[serverless] No data returned for NFT:', mintAddress);
      return res.status(404).json({ 
        success: false, 
        message: 'NFT not found',
        error: 'NFT_NOT_FOUND'
      });
    }
    
    // Process and return the NFT data
    const processedData = {
      mint: mintAddress,
      name: nftData.content?.metadata?.name || nftData.name || 'Unknown NFT',
      description: nftData.content?.metadata?.description || nftData.description || '',
      image: nftData.content?.files?.[0]?.uri || nftData.content?.links?.image || nftData.image || '',
      attributes: nftData.content?.metadata?.attributes || nftData.attributes || [],
      owner: typeof nftData.owner === 'string' 
        ? { publicKey: nftData.owner }
        : {
            publicKey: nftData.owner?.publicKey || nftData.ownership?.owner || '',
            delegate: nftData.owner?.delegate || null,
            ownershipModel: nftData.owner?.ownershipModel || 'single',
            frozen: nftData.owner?.frozen || false,
            delegated: nftData.owner?.delegated || false,
          },
      collection: (nftData.grouping && nftData.grouping.find(g => g.group_key === 'collection'))
        ? {
            address: nftData.grouping.find(g => g.group_key === 'collection').group_value,
            name: nftData.content?.metadata?.collection?.name || ''
          }
        : null,
      creators: nftData.creators || [],
      royalty: nftData.royalty || null,
      tokenStandard: nftData.tokenStandard || null,
    };
    
    console.log(`[serverless] Successfully processed NFT data for ${mintAddress}`);
    
    return res.status(200).json({
      success: true,
      nft: processedData
    });
  } catch (error) {
    console.error(`[serverless] Error processing NFT ${mintAddress}:`, error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching NFT data',
      error: error.message || 'UNKNOWN_ERROR'
    });
  }
}; 