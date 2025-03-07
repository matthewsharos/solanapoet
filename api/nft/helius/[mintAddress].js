const axios = require('axios');

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Serverless function handler
module.exports = async (req, res) => {
  // Basic CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { mintAddress } = req.query;
  
  console.log(`[serverless] NFT Helius endpoint called for: ${mintAddress}`);
  
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
    // Get the Helius API key
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    if (!heliusApiKey) {
      console.error('[serverless] ERROR: Helius API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Helius API key not configured',
        error: 'MISSING_API_KEY'
      });
    }
    
    // Create an axios instance with timeout
    const heliusClient = axios.create({
      timeout: 10000 // 10 second timeout
    });
    
    // Make request to Helius RPC API
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
      
      const nftData = rpcResponse.data.result;
      
      if (!nftData) {
        return res.status(404).json({
          success: false,
          message: 'NFT not found',
          error: 'NFT_NOT_FOUND'
        });
      }
      
      // Simplify the response to avoid complex property access errors
      const processedData = {
        mint: mintAddress,
        name: nftData.content?.metadata?.name || nftData.name || 'Unknown NFT',
        description: nftData.content?.metadata?.description || nftData.description || '',
        image: nftData.content?.files?.[0]?.uri || nftData.content?.links?.image || nftData.image || '',
        owner: typeof nftData.owner === 'string' 
          ? { publicKey: nftData.owner }
          : { publicKey: nftData.owner?.publicKey || nftData.ownership?.owner || '' }
      };
      
      return res.status(200).json({
        success: true,
        nft: processedData
      });
      
    } catch (error) {
      console.error(`[serverless] RPC API error: ${error.message}`);
      
      // Fallback to metadata API
      try {
        const metadataResponse = await heliusClient.post(
          `https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`,
          {
            mintAccounts: [mintAddress]
          }
        );
        
        const nftData = metadataResponse.data.data?.[0];
        
        if (!nftData) {
          return res.status(404).json({
            success: false,
            message: 'NFT not found in metadata API',
            error: 'NFT_NOT_FOUND_METADATA'
          });
        }
        
        // Simplify the response
        const processedData = {
          mint: mintAddress,
          name: nftData.name || 'Unknown NFT',
          description: nftData.description || '',
          image: nftData.image || '',
          owner: { publicKey: nftData.owner || '' }
        };
        
        return res.status(200).json({
          success: true,
          nft: processedData
        });
        
      } catch (metadataError) {
        console.error(`[serverless] Metadata API error: ${metadataError.message}`);
        return res.status(500).json({
          success: false,
          message: 'Error fetching NFT data from both APIs',
          error: metadataError.message
        });
      }
    }
  } catch (error) {
    console.error(`[serverless] Overall error: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      message: 'Server error processing request',
      error: error.message
    });
  }
}; 