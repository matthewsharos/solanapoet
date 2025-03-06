import { PublicKey } from '@solana/web3.js';

export interface NFTMetadata {
  name: string;
  image: string;
  description?: string;
  mint: string;
}

export const fetchCollectionNFTs = async (collectionAddress: string): Promise<NFTMetadata[]> => {
  try {
    // Validate collection address
    if (!collectionAddress) {
      console.warn('No collection address provided to fetchCollectionNFTs');
      return [];
    }

    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=' + import.meta.env.VITE_HELIUS_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionAddress,
          page: 1,
          limit: 1000,
        },
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result.items.map((item: any) => ({
      mint: item.id,
      name: item.content?.metadata?.name || 'Untitled',
      image: item.content?.files?.[0]?.uri || item.content?.links?.image || '',
      description: item.content?.metadata?.description || ''
    }));
  } catch (error) {
    console.error('Error fetching collection NFTs:', error);
    return [];
  }
}; 