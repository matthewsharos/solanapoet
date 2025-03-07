import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// Configure the API route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: '10mb'
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      return res.status(400).json({ success: false, message: 'Collection ID is required' });
    }

    // Direct RPC call structure
    const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const rpcPayload = {
      jsonrpc: "2.0",
      id: "my-id",
      method: "getAssetsByGroup",
      params: {
        groupKey: "collection",
        groupValue: collectionId,
        page: Number(page),
        limit: Number(limit)
      }
    };

    const response = await axios({
      url: rpcEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      data: rpcPayload,
      timeout: 15000 // Match the timeout from Market.tsx
    });

    if (response.data?.error) {
      console.error('Helius API error:', response.data.error);
      return res.status(400).json({
        success: false,
        message: 'Helius API error',
        error: response.data.error
      });
    }

    // Match the exact response structure expected by Market.tsx
    return res.status(200).json({
      success: true,
      result: {
        items: response.data.result || [],
        total: response.data.result?.length || 0,
        page: Number(page)
      }
    });

  } catch (error: any) {
    console.error('Collection fetch error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // Match error response structure from Market.tsx
    return res.status(500).json({
      success: false,
      message: 'Error fetching collection NFTs',
      error: error.message,
      details: error.response?.data
    });
  }
} 