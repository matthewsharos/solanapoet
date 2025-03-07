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
    // Safely get the Helius API key with fallback
    let heliusApiKey;
    try {
      heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    } catch (error) {
      console.error('[serverless] Error accessing environment variables:', error);
      heliusApiKey = null;
    }
    
    if (!heliusApiKey) {
      console.error('[serverless] ERROR: Helius API key not configured');
      // Return a fallback mock NFT response instead of error
      return res.status(200).json({ 
        success: true, 
        nft: {
          mint: mintAddress,
          name: 'Mock NFT (API Key Missing)',
          description: 'This is a mock NFT returned because the Helius API key is not configured.',
          image: 'https://placehold.co/600x400?text=NFT+Preview+Unavailable',
          owner: { publicKey: 'MOCK_OWNER_ADDRESS' }
        },
        mock: true
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
        // Return a fallback mock NFT response instead of error
        return res.status(200).json({
          success: true,
          nft: {
            mint: mintAddress,
            name: 'NFT Not Found',
            description: 'This NFT could not be found in the Helius API.',
            image: 'https://placehold.co/600x400?text=NFT+Not+Found',
            owner: { publicKey: '' }
          },
          mock: true
        });
      }
      
      // Safely process the data with fallbacks for every property
      const processedData = {
        mint: mintAddress,
        name: 'Unknown NFT',
        description: '',
        image: 'https://placehold.co/600x400?text=Image+Not+Available',
        owner: { publicKey: '' }
      };
      
      // Carefully access nested properties with fallbacks
      try {
        processedData.name = nftData.content?.metadata?.name || nftData.name || 'Unknown NFT';
      } catch (e) {
        console.error('[serverless] Error processing NFT name:', e);
      }
      
      try {
        processedData.description = nftData.content?.metadata?.description || nftData.description || '';
      } catch (e) {
        console.error('[serverless] Error processing NFT description:', e);
      }
      
      try {
        processedData.image = nftData.content?.files?.[0]?.uri || 
                             nftData.content?.links?.image || 
                             nftData.image || 
                             'https://placehold.co/600x400?text=Image+Not+Available';
      } catch (e) {
        console.error('[serverless] Error processing NFT image:', e);
      }
      
      try {
        if (typeof nftData.owner === 'string') {
          processedData.owner = { publicKey: nftData.owner };
        } else if (nftData.owner?.publicKey) {
          processedData.owner = { publicKey: nftData.owner.publicKey };
        } else if (nftData.ownership?.owner) {
          processedData.owner = { publicKey: nftData.ownership.owner };
        }
      } catch (e) {
        console.error('[serverless] Error processing NFT owner:', e);
      }
      
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
        
        let nftData = null;
        try {
          nftData = metadataResponse.data.data?.[0];
        } catch (e) {
          console.error('[serverless] Error accessing metadata response data:', e);
        }
        
        if (!nftData) {
          // Return a fallback mock NFT response instead of error
          return res.status(200).json({
            success: true,
            nft: {
              mint: mintAddress,
              name: 'NFT Not Found (Metadata)',
              description: 'This NFT could not be found in the Helius Metadata API.',
              image: 'https://placehold.co/600x400?text=NFT+Not+Found',
              owner: { publicKey: '' }
            },
            mock: true
          });
        }
        
        // Safe data extraction with defaults
        const processedData = {
          mint: mintAddress,
          name: nftData.name || 'Unknown NFT',
          description: nftData.description || '',
          image: nftData.image || 'https://placehold.co/600x400?text=Image+Not+Available',
          owner: { publicKey: nftData.owner || '' }
        };
        
        return res.status(200).json({
          success: true,
          nft: processedData
        });
        
      } catch (metadataError) {
        console.error(`[serverless] Metadata API error: ${metadataError.message}`);
        // Return a fallback mock NFT instead of error
        return res.status(200).json({
          success: true,
          nft: {
            mint: mintAddress,
            name: 'API Error - Fallback NFT',
            description: 'This is a fallback NFT returned because of an error fetching data from Helius API.',
            image: 'https://placehold.co/600x400?text=API+Error',
            owner: { publicKey: '' }
          },
          mock: true,
          error: metadataError.message
        });
      }
    }
  } catch (error) {
    console.error(`[serverless] Overall error: ${error.message}`);
    
    // Always return a valid response, never an error
    return res.status(200).json({
      success: true,
      nft: {
        mint: mintAddress,
        name: 'Error - Fallback NFT',
        description: 'This is a fallback NFT returned because of a server error.',
        image: 'https://placehold.co/600x400?text=Server+Error',
        owner: { publicKey: '' }
      },
      mock: true,
      troubleshooting: {
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
}; 