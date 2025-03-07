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

    console.log('Forwarding request to Helius:', {
      method: req.body.method,
      params: req.body.params
    });

    // Forward the request to Helius
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: req.body.id || 'collection-nfts',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: req.body.params.groupValue,
          page: req.body.params.page || 1,
          limit: req.body.params.limit || 1000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Helius response received:', {
      status: response.status,
      itemCount: response.data?.result?.items?.length || 0,
      firstItem: response.data?.result?.items?.[0] ? {
        id: response.data.result.items[0].id,
        name: response.data.result.items[0].content?.metadata?.name
      } : null
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error fetching collection NFTs:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching collection NFTs',
      error: error.response?.data || error.message
    });
  }
} 