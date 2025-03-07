import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { mint } = req.query;
  
  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing or invalid mint address' });
  }

  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    // Use the DAS API endpoint for NFT data
    const response = await axios.post(
      `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
      { mintAccounts: [mint] }
    );

    const nftData = response.data[0];
    
    if (!nftData) {
      return res.status(404).json({ success: false, message: 'NFT not found' });
    }

    // Transform the data to match expected format
    const transformedData = {
      mint: nftData.mint,
      name: nftData.onChainMetadata?.metadata?.data?.name || 'Unknown',
      symbol: nftData.onChainMetadata?.metadata?.data?.symbol,
      description: nftData.onChainMetadata?.metadata?.data?.uri,
      image: nftData.offChainMetadata?.image || '',
      attributes: nftData.offChainMetadata?.attributes,
      owner: nftData.account,
      collection: {
        address: nftData.onChainMetadata?.metadata?.collection?.key || '',
        name: nftData.onChainMetadata?.metadata?.collection?.verified ? 
          nftData.onChainMetadata?.metadata?.collection?.key : ''
      },
      tokenMetadata: nftData
    };

    return res.status(200).json({ success: true, nft: transformedData });
  } catch (error: any) {
    console.error('Error fetching NFT data:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching NFT data' 
    });
  }
} 