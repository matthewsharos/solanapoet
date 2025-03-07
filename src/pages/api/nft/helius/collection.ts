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
        payload: requestPayload
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
        error: response.data?.error
      });

      if (response.data?.result) {
        const normalizedResponse = {
          jsonrpc: '2.0',
          id: 'collection-nfts',
          result: {
            items: Array.isArray(response.data.result) ? response.data.result : (response.data.result.items || []),
            total: response.data.result.total || (Array.isArray(response.data.result) ? response.data.result.length : 0),
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
      }

      console.log('No result in response, falling through to searchAssets');
    } catch (error: any) {
      console.error('Error using getAssetsByGroup:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        stack: error.stack
      });
      // Fall through to searchAssets
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
        payload: searchPayload
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
        error: searchResponse.data?.error
      });

      if (searchResponse.data?.result) {
        const normalizedResponse = {
          jsonrpc: '2.0',
          id: 'collection-nfts',
          result: {
            items: searchResponse.data.result.items || [],
            total: searchResponse.data.result.total || 0,
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
      }

      throw new Error('Invalid response from both Helius API methods');
    } catch (searchError: any) {
      console.error('Error using searchAssets:', {
        message: searchError.message,
        status: searchError.response?.status,
        statusText: searchError.response?.statusText,
        responseData: searchError.response?.data,
        stack: searchError.stack
      });
      throw searchError;
    }
  } catch (error: any) {
    // Log the complete error for debugging
    console.error('Error fetching collection NFTs:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      requestData: error.config?.data ? JSON.parse(error.config.data) : undefined
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
      error: error.response?.data || error.message,
      details: {
        responseData: error.response?.data,
        requestData: error.config?.data ? JSON.parse(error.config.data) : undefined,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
} 