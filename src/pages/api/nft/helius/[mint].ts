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

    // Use the getAsset endpoint for NFT data
    const response = await axios.get(
      `https://api.helius.xyz/v0/assets?api-key=${heliusApiKey}&ids=${mint}`
    );

    const nftData = response.data[0];
    
    if (!nftData) {
      return res.status(404).json({ success: false, message: 'NFT not found' });
    }

    // Transform the data to match expected format
    const transformedData = {
      mint: nftData.id,
      name: nftData.content?.metadata?.name || nftData.content?.metadata?.symbol || 'Unknown',
      symbol: nftData.content?.metadata?.symbol,
      description: nftData.content?.metadata?.description,
      image: nftData.content?.files?.[0]?.uri || nftData.content?.metadata?.image || '',
      attributes: nftData.content?.metadata?.attributes,
      owner: nftData.ownership?.owner,
      collection: {
        address: nftData.grouping?.[0]?.group_value || '',
        name: nftData.content?.metadata?.collection?.name || ''
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