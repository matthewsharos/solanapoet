import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    const { collectionId, page = 1, limit = 1000 } = req.body;
    
    if (!collectionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Collection ID is required' 
      });
    }

    console.log('Fetching collection NFTs:', {
      collectionId,
      page,
      limit,
      hasApiKey: !!heliusApiKey
    });

    // Try getAssetsByGroup first as it's more reliable for collections
    try {
      const requestPayload = {
        jsonrpc: '2.0',
        id: 'collection-nfts',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionId,
          page: Number(page),
          limit: Number(limit),
          displayOptions: {
            showCollectionMetadata: true,
            showUnverifiedCollections: true
          },
          sortBy: {
            sortBy: 'created',
            sortDirection: 'desc'
          }
        }
      };

      console.log('Making Helius API request:', {
        url: 'https://mainnet.helius-rpc.com',
        method: 'POST',
        payload: JSON.stringify(requestPayload)
      });

      const response = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      console.log('Raw Helius response:', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        hasResult: !!response.data?.result,
        resultType: response.data?.result ? typeof response.data.result : 'undefined',
        isArray: Array.isArray(response.data?.result),
        hasItems: !!response.data?.result?.items,
        error: response.data?.error,
        rawResponse: JSON.stringify(response.data)
      });

      if (!response.data) {
        throw new Error('No data received from Helius API');
      }

      if (response.data.error) {
        throw new Error(`Helius API error: ${JSON.stringify(response.data.error)}`);
      }

      if (!response.data.result) {
        throw new Error('No result field in Helius API response');
      }

      const result = response.data.result;
      let items = [];
      let total = 0;

      // Handle different response formats
      if (Array.isArray(result)) {
        items = result;
        total = result.length;
      } else if (typeof result === 'object' && result.items) {
        items = result.items;
        total = result.total || items.length;
      } else {
        throw new Error(`Unexpected result format: ${JSON.stringify(result)}`);
      }

      const normalizedResponse = {
        jsonrpc: '2.0',
        id: 'collection-nfts',
        result: {
          items,
          total,
          page: Number(page)
        }
      };

      console.log('Normalized response:', {
        itemCount: normalizedResponse.result.items.length,
        total: normalizedResponse.result.total,
        page: normalizedResponse.result.page,
        sampleItem: normalizedResponse.result.items[0] ? {
          id: normalizedResponse.result.items[0].id,
          hasContent: !!normalizedResponse.result.items[0].content,
          hasMetadata: !!normalizedResponse.result.items[0].content?.metadata
        } : null
      });

      return res.status(200).json(normalizedResponse);
    } catch (error: any) {
      console.error('Error using getAssetsByGroup:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? JSON.stringify(error.response.data) : undefined,
        stack: error.stack
      });

      // If this is a Helius API error, try the fallback
      if (error.response?.status === 400 || error.response?.status === 404) {
        console.log('Helius API error, trying fallback...');
      } else {
        // For other errors, throw immediately
        throw error;
      }
    }

    // Fallback to searchAssets if getAssetsByGroup fails
    try {
      const searchPayload = {
        jsonrpc: '2.0',
        id: 'collection-search',
        method: 'searchAssets',
        params: {
          ownerAddress: null,
          grouping: ['collection', collectionId],
          page: Number(page),
          limit: Number(limit),
          displayOptions: {
            showCollectionMetadata: true,
            showUnverifiedCollections: true
          }
        }
      };

      console.log('Trying searchAssets fallback:', {
        url: 'https://mainnet.helius-rpc.com',
        method: 'POST',
        payload: JSON.stringify(searchPayload)
      });

      const searchResponse = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        searchPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      console.log('Raw searchAssets response:', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        hasData: !!searchResponse.data,
        hasResult: !!searchResponse.data?.result,
        resultType: searchResponse.data?.result ? typeof searchResponse.data.result : 'undefined',
        error: searchResponse.data?.error,
        rawResponse: JSON.stringify(searchResponse.data)
      });

      if (!searchResponse.data) {
        throw new Error('No data received from Helius searchAssets API');
      }

      if (searchResponse.data.error) {
        throw new Error(`Helius searchAssets API error: ${JSON.stringify(searchResponse.data.error)}`);
      }

      if (!searchResponse.data.result) {
        throw new Error('No result field in Helius searchAssets API response');
      }

      const result = searchResponse.data.result;
      const items = Array.isArray(result) ? result : (result.items || []);
      const total = result.total || items.length;

      const normalizedResponse = {
        jsonrpc: '2.0',
        id: 'collection-nfts',
        result: {
          items,
          total,
          page: Number(page)
        }
      };

      console.log('Normalized searchAssets response:', {
        itemCount: normalizedResponse.result.items.length,
        total: normalizedResponse.result.total,
        page: normalizedResponse.result.page,
        sampleItem: normalizedResponse.result.items[0] ? {
          id: normalizedResponse.result.items[0].id,
          hasContent: !!normalizedResponse.result.items[0].content,
          hasMetadata: !!normalizedResponse.result.items[0].content?.metadata
        } : null
      });

      return res.status(200).json(normalizedResponse);
    } catch (searchError: any) {
      console.error('Error using searchAssets:', {
        message: searchError.message,
        status: searchError.response?.status,
        statusText: searchError.response?.statusText,
        responseData: searchError.response?.data ? JSON.stringify(searchError.response.data) : undefined,
        stack: searchError.stack
      });
      throw searchError;
    }
  } catch (error: any) {
    // Log the complete error for debugging
    console.error('Error fetching collection NFTs:', {
      message: error.message,
      response: error.response?.data ? JSON.stringify(error.response.data) : undefined,
      status: error.response?.status,
      code: error.code,
      stack: error.stack,
      requestData: error.config?.data ? JSON.stringify(JSON.parse(error.config.data)) : undefined
    });

    // Handle specific error cases
    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded, please try again later',
        error: error.response.data
      });
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Request timed out',
        error: 'The request to Helius API timed out'
      });
    }

    // Handle Helius API errors
    if (error.response?.data?.error) {
      return res.status(400).json({
        success: false,
        message: 'Helius API error',
        error: error.response.data.error
      });
    }

    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collection NFTs',
      error: error.message,
      details: {
        responseData: error.response?.data ? JSON.stringify(error.response.data) : undefined,
        requestData: error.config?.data ? JSON.stringify(JSON.parse(error.config.data)) : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
} 