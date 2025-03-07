import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.error('Helius API key missing');
      throw new Error('Helius API key not configured');
    }

    console.log('API Key check:', {
      exists: !!heliusApiKey,
      length: heliusApiKey.length,
      prefix: heliusApiKey.substring(0, 4)
    });

    const { collectionId } = req.body;
    if (!collectionId) {
      return res.status(400).json({ message: 'Collection ID is required' });
    }

    console.log('Processing request for collection:', collectionId);

    // Using exact working payload structure
    const payload = {
      jsonrpc: "2.0",
      id: "my-id",
      method: "getAssetsByGroup",
      params: {
        groupKey: "collection",
        groupValue: collectionId,
        page: 1,
        limit: 1000
      }
    };

    console.log('Sending request to Helius with payload:', JSON.stringify(payload));

    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Helius response status:', response.status);
    console.log('Helius response headers:', response.headers);
    console.log('Helius response data:', JSON.stringify(response.data));

    if (response.data.error) {
      console.error('Helius returned error:', response.data.error);
      return res.status(400).json({
        message: 'Helius API error',
        error: response.data.error
      });
    }

    // Return the raw response
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Collection fetch error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
      }
    });

    if (error.response?.status === 429) {
      return res.status(429).json({
        message: 'Rate limit exceeded',
        error: error.response.data
      });
    }

    return res.status(500).json({ 
      message: 'Error fetching collection NFTs',
      error: error.response?.data || error.message,
      details: {
        status: error.response?.status,
        statusText: error.response?.statusText
      }
    });
  }
} 