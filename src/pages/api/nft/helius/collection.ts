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
      limit
    });

    // Forward the request to Helius
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
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
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000 // 30 second timeout
      }
    );

    // Validate the response structure
    if (!response.data?.result?.items && !response.data?.result?.length) {
      console.error('Invalid Helius response:', response.data);
      throw new Error('Invalid response from Helius API');
    }

    // Normalize the response structure
    const normalizedResponse = {
      ...response.data,
      result: {
        items: Array.isArray(response.data.result) ? response.data.result : response.data.result.items,
        total: response.data.result.total || (Array.isArray(response.data.result) ? response.data.result.length : 0),
        page: Number(page)
      }
    };

    console.log('Helius response received:', {
      status: response.status,
      itemCount: normalizedResponse.result.items.length,
      total: normalizedResponse.result.total,
      page: normalizedResponse.result.page
    });

    return res.status(200).json(normalizedResponse);
  } catch (error: any) {
    console.error('Error fetching collection NFTs:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collection NFTs',
      error: error.response?.data || error.message
    });
  }
} 