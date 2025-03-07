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

    // Try REST API first as it's more reliable for collections
    try {
      console.log('Making Helius REST API request:', {
        url: 'https://api.helius.xyz/v1/nfts',
        method: 'POST'
      });

      const response = await axios.post(
        `https://api.helius.xyz/v1/nfts?api-key=${heliusApiKey}`,
        {
          ownerAddress: null,
          collectionAddress: collectionId,
          pageNumber: Number(page),
          limit: Number(limit)
        },
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
        resultCount: Array.isArray(response.data) ? response.data.length : 0,
        error: response.data?.error,
        rawResponse: JSON.stringify(response.data)
      });

      if (!response.data) {
        throw new Error('No data received from Helius API');
      }

      if (response.data.error) {
        throw new Error(`Helius API error: ${JSON.stringify(response.data.error)}`);
      }

      if (!Array.isArray(response.data)) {
        throw new Error('Expected array response from Helius API');
      }

      const items = response.data;
      const total = items.length; // REST API doesn't provide total count

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
      console.error('Error using REST API:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? JSON.stringify(error.response.data) : undefined,
        stack: error.stack
      });

      // If this is a Helius API error, try the fallback
      if (error.response?.status === 400 || error.response?.status === 404) {
        console.log('Helius REST API error, trying fallback...');
      } else {
        // For other errors, throw immediately
        throw error;
      }
    }

    // Fallback to RPC API if REST fails
    try {
      const searchPayload = {
        jsonrpc: '2.0',
        id: 'collection-search',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionId,
          page: Number(page),
          limit: Number(limit),
          displayOptions: {
            showCollectionMetadata: true,
            showUnverifiedCollections: true
          }
        }
      };

      console.log('Trying RPC fallback:', {
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

      console.log('Raw RPC response:', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        hasData: !!searchResponse.data,
        hasResult: !!searchResponse.data?.result,
        resultType: searchResponse.data?.result ? typeof searchResponse.data.result : 'undefined',
        error: searchResponse.data?.error,
        rawResponse: JSON.stringify(searchResponse.data)
      });

      if (!searchResponse.data) {
        throw new Error('No data received from Helius RPC API');
      }

      if (searchResponse.data.error) {
        throw new Error(`Helius RPC API error: ${JSON.stringify(searchResponse.data.error)}`);
      }

      if (!searchResponse.data.result) {
        throw new Error('No result field in Helius RPC API response');
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

      console.log('Normalized RPC response:', {
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
      console.error('Error using RPC API:', {
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