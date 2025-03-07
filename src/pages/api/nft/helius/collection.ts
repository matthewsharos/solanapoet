import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    const { collectionId } = req.body;
    if (!collectionId) {
      return res.status(400).json({ message: 'Collection ID is required' });
    }

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

    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Return the raw response
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Collection fetch error:', {
      message: error.message,
      response: error.response?.data
    });

    return res.status(500).json({ 
      message: 'Error fetching collection NFTs',
      error: error.response?.data || error.message
    });
  }
} 