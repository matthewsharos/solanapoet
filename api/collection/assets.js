import axios from 'axios';

// In-memory cache for collection assets
const assetsCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

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
    const { collectionId, page = 1, limit = 10, refresh = 'false' } = req.query;
    const forceRefresh = refresh === 'true';
    
    if (!collectionId) {
      return res.status(400).json({
        success: false,
        message: 'Collection ID is required'
      });
    }
    
    console.log(`Fetching assets for collection: ${collectionId}, page: ${page}, limit: ${limit}, forceRefresh: ${forceRefresh}`);
    
    // Create cache key from parameters
    const cacheKey = `${collectionId}:${page}:${limit}`;
    
    // Check if data exists in cache and isn't stale
    if (!forceRefresh && assetsCache.has(cacheKey)) {
      const cachedData = assetsCache.get(cacheKey);
      const now = Date.now();
      
      if (now - cachedData.timestamp < CACHE_DURATION) {
        console.log(`Returning cached data for ${cacheKey}`);
        return res.status(200).json({
          ...cachedData.data,
          fromCache: true
        });
      }
    }
    
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
        id: "my-id",
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
    
    // Log the raw response for debugging
    console.log('Helius response:', JSON.stringify(heliusResponse.data, null, 2).substring(0, 500) + '...');
    
    // Check if the response contains the expected data
    if (!heliusResponse.data) {
      console.error('Empty Helius response');
      throw new Error('Empty response from Helius API');
    }
    
    // Format the response to EXACTLY match what the frontend expects
    // The frontend is looking for response.data.result.items
    const formattedResponse = {
      status: 200,
      result: {
        items: [],
        total: 0
      }
    };
    
    if (heliusResponse.data.result && Array.isArray(heliusResponse.data.result.items)) {
      const assets = heliusResponse.data.result.items;
      const total = heliusResponse.data.result.total || 0;
      
      formattedResponse.result.items = assets;
      formattedResponse.result.total = total;
      
      console.log(`Found ${assets.length} assets for collection ${collectionId} (total: ${total})`);
    } else if (heliusResponse.data.error) {
      console.error('Helius API error:', heliusResponse.data.error);
      formattedResponse.status = 500;
      formattedResponse.error = heliusResponse.data.error;
    } else {
      console.log('No assets found or unexpected response format');
      // Still provide a valid result structure even if empty
      formattedResponse.result = {
        items: [],
        total: 0
      };
    }
    
    // Save to cache with timestamp
    assetsCache.set(cacheKey, {
      data: formattedResponse,
      timestamp: Date.now()
    });
    
    // Auto-clear cache after expiration to prevent memory leaks
    setTimeout(() => {
      if (assetsCache.has(cacheKey)) {
        assetsCache.delete(cacheKey);
        console.log(`Cache entry for ${cacheKey} expired and was removed`);
      }
    }, CACHE_DURATION);
    
    // Return the formatted response
    return res.status(200).json(formattedResponse);
  } catch (error) {
    console.error('Collection assets endpoint error:', error);
    
    // Return the expected structure even in error case
    return res.status(200).json({ 
      status: 500,
      result: {
        items: [],
        total: 0
      },
      error: error.message
    });
  }
} 