import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.error('Helius API key missing');
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

    console.log('Attempting RPC call to:', rpcEndpoint);
    console.log('With payload:', JSON.stringify(rpcPayload, null, 2));

    try {
      const response = await axios({
        url: rpcEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: rpcPayload,
        timeout: 30000
      });

      console.log('RPC Response received:', {
        status: response.status,
        hasData: !!response.data,
        hasResult: !!response.data?.result
      });

      // Check for RPC-specific errors
      if (response.data?.error) {
        console.error('RPC Error:', response.data.error);
        return res.status(400).json({
          message: 'RPC Error',
          error: response.data.error
        });
      }

      // Validate response structure
      if (!response.data?.result) {
        console.error('Invalid RPC response structure:', response.data);
        return res.status(500).json({
          message: 'Invalid RPC response structure',
          error: 'No result field in response'
        });
      }

      // Return the successful response
      return res.status(200).json(response.data);

    } catch (rpcError: any) {
      console.error('RPC call failed:', {
        message: rpcError.message,
        status: rpcError.response?.status,
        data: rpcError.response?.data
      });

      // Handle specific RPC errors
      if (rpcError.response?.status === 429) {
        return res.status(429).json({
          message: 'Rate limit exceeded',
          error: rpcError.response.data
        });
      }

      throw rpcError; // Re-throw for general error handling
    }

  } catch (error: any) {
    console.error('Collection fetch error:', {
      message: error.message,
      name: error.name,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack
    });

    // Return appropriate error response
    return res.status(500).json({
      message: 'Error fetching collection NFTs',
      error: error.message,
      details: {
        status: error.response?.status,
        data: error.response?.data
      }
    });
  }
} 