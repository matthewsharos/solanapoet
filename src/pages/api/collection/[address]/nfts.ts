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

    // First, get the collection metadata to check if it's an ultimate collection
    const collectionsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/sheets/collections`);
    const collections = collectionsResponse.data.data;
    
    const collection = collections.find((c: any) => c[0] === address);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }

    // Check if this is an ultimates collection
    const isUltimatesCollection = collection[6]?.toLowerCase() === 'true';
    if (isUltimatesCollection) {
      return res.status(200).json({ success: true, nfts: [] });
    }

    // Use the searchAssets endpoint for collection NFTs
    const response = await axios.post(
      `https://api.helius.xyz/v0/assets/search?api-key=${heliusApiKey}`,
      {
        ownerAddress: address,
        displayOptions: {
          showCollectionMetadata: true,
          showFungible: false,
        }
      }
    );

    const nfts = response.data.result
      .filter((nft: any) => nft && !nft.content?.metadata?.name?.includes('Metadata'))
      .map((nft: any) => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || nft.content?.metadata?.symbol || 'Unknown',
        symbol: nft.content?.metadata?.symbol,
        description: nft.content?.metadata?.description,
        image: nft.content?.files?.[0]?.uri || nft.content?.metadata?.image || '',
        attributes: nft.content?.metadata?.attributes,
        owner: nft.ownership?.owner,
        collection: {
          address: address,
          name: collection[1] || 'Unknown Collection'
        }
      }));

    return res.status(200).json({ success: true, nfts });
  } catch (error: any) {
    console.error('Error fetching collection NFTs:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching collection NFTs' 
    });
  }
} 