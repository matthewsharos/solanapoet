import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// Configure the API route with larger limits
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
    // Get Helius API Key
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        message: 'API key not configured',
        error: 'HELIUS_API_KEY not found in environment variables'
      });
    }

    // Get collection ID
    const { collectionId } = req.body;
    if (!collectionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Collection ID required',
        error: 'Missing collectionId in request body'
      });
    }

    // Make direct call to Helius
    try {
      const heliusResponse = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
        {
          jsonrpc: "2.0",
          id: "my-id",
          method: "getAssetsByGroup",
          params: {
            groupKey: "collection",
            groupValue: collectionId
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      // Return success with Helius data
      return res.status(200).json({ 
        success: true, 
        result: {
          items: heliusResponse.data.result || [],
          total: heliusResponse.data.result?.length || 0,
          page: 1
        } 
      });
    } catch (heliusError: any) {
      console.error('Helius API error:', heliusError.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Helius API error',
        error: heliusError.message,
        status: heliusError.response?.status,
        statusText: heliusError.response?.statusText,
        data: heliusError.response?.data
      });
    }
  } catch (error: any) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error processing request',
      error: error.message
    });
  }
} 