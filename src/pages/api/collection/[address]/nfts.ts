import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { address } = req.query;
  
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing or invalid collection address' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    const response = await axios.post(
      `https://api.helius.xyz/v0/token-accounts?api-key=${heliusApiKey}`,
      {
        ownerAddress: address,
        displayOptions: {
          showCollectionMetadata: true,
          showNativeBalance: false,
        }
      }
    );

    const nfts = response.data.filter((token: any) => 
      token.tokenMetadata && 
      !token.tokenMetadata.metadata.name.includes('Metadata')
    );

    return res.status(200).json({ success: true, nfts });
  } catch (error: any) {
    console.error('Error fetching collection NFTs:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching collection NFTs' 
    });
  }
} 