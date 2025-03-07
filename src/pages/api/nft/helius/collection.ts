import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

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

    // Direct RPC call structure
    const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const rpcPayload = {
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

    const response = await axios({
      url: rpcEndpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: rpcPayload,
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    // Set response headers for large JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Stream the response
    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('Collection fetch error:', {
      message: error.message,
      name: error.name,
      status: error.response?.status,
      data: error.response?.data
    });

    return res.status(500).json({
      message: 'Error fetching collection NFTs',
      error: error.message,
      details: error.response?.data
    });
  }
} 