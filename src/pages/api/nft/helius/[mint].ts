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

    // First try the DAS API endpoint
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAsset",
        params: {
          id: mint
        }
      }
    );

    if (!response.data.result) {
      throw new Error('NFT not found');
    }

    const nftData = response.data.result;
    
    // Get the best available image URL
    const getImageUrl = (data: any) => {
      // Try all possible image locations in order of preference
      return data.content?.files?.[0]?.uri || // Original Arweave URL
             data.content?.files?.[0]?.cdn_uri || // Helius CDN URL
             data.content?.links?.image || // Fallback to links.image
             data.content?.metadata?.image || // Try metadata image
             ''; // Empty string if no image found
    };

    // Transform the data to match expected format
    const transformedData = {
      mint: nftData.id,
      name: nftData.content?.metadata?.name || 'Unknown',
      symbol: nftData.content?.metadata?.symbol,
      description: nftData.content?.metadata?.description,
      image: getImageUrl(nftData),
      attributes: nftData.content?.metadata?.attributes,
      owner: nftData.ownership?.owner,
      collection: {
        address: nftData.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || '',
        name: nftData.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || ''
      },
      tokenMetadata: nftData
    };

    return res.status(200).json({ success: true, nft: transformedData });
  } catch (error: any) {
    console.error('Error fetching NFT data:', error);
    if (error.message === 'NFT not found') {
      return res.status(404).json({ 
        success: false, 
        message: 'NFT not found'
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching NFT data' 
    });
  }
} 