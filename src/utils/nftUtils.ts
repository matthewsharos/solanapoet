import { PublicKey } from '@solana/web3.js';
import { API_BASE_URL } from '../types/api';

export interface NFTMetadata {
  name: string;
  image: string;
  description?: string;
  mint: string;
  owner?: {
    publicKey: string;
    ownershipModel?: string;
    delegated?: boolean;
    delegate?: string | null;
    frozen?: boolean;
  } | string;
  createdAt?: string;
}

// Cache to prevent redundant fetches
const collectionCache = new Map<string, {
  data: NFTMetadata[],
  timestamp: number
}>();

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes, increased from 10

// Image preloading queue to control parallel loads
const preloadQueue: string[] = [];
const MAX_CONCURRENT_PRELOADS = 6;
let activePreloads = 0;

// Helper function to preload images
const preloadImage = (imageUrl: string): Promise<void> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      activePreloads--;
      processQueue();
      resolve();
    };
    img.onerror = () => {
      activePreloads--;
      processQueue();
      resolve(); // Resolve even on error to continue the queue
    };
    img.src = imageUrl;
  });
};

// Process the preload queue
const processQueue = () => {
  while (activePreloads < MAX_CONCURRENT_PRELOADS && preloadQueue.length > 0) {
    const nextUrl = preloadQueue.shift();
    if (nextUrl) {
      activePreloads++;
      preloadImage(nextUrl).catch(() => {
        // Just log and continue
        console.error(`Failed to preload image: ${nextUrl}`);
      });
    }
  }
};

// Add an image URL to the preload queue
export const queueImagePreload = (imageUrl: string | null | undefined): void => {
  if (!imageUrl) return;
  
  // Don't add duplicates
  if (preloadQueue.includes(imageUrl)) return;
  
  preloadQueue.push(imageUrl);
  processQueue();
};

export const fetchCollectionNFTs = async (collectionAddress: string): Promise<NFTMetadata[]> => {
  try {
    // Validate collection address
    if (!collectionAddress) {
      console.warn('No collection address provided to fetchCollectionNFTs');
      return [];
    }
    
    // Check cache first
    const cacheKey = collectionAddress;
    const cachedEntry = collectionCache.get(cacheKey);
    const now = Date.now();
    
    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION)) {
      console.log(`Using cached NFTs for collection ${collectionAddress}`);
      
      // Preload images for cached NFTs to improve perceived performance
      cachedEntry.data.slice(0, 12).forEach(nft => {
        if (nft.image) {
          queueImagePreload(nft.image);
        }
      });
      
      return cachedEntry.data;
    }

    console.log(`Fetching NFTs for collection ${collectionAddress} from server...`);
    
    // First try the server-side endpoint that uses the server's Helius API key
    try {
      const serverResponse = await fetch(`${API_BASE_URL}/api/collection/${collectionAddress}/nfts`);
      if (serverResponse.ok) {
        const data = await serverResponse.json();
        if (data.success && Array.isArray(data.nfts)) {
          console.log(`Received ${data.nfts.length} NFTs from server for collection ${collectionAddress}`);
          
          // Preload the first few images to improve perceived performance
          data.nfts.slice(0, 12).forEach((nft: NFTMetadata) => {
            if (nft.image) {
              queueImagePreload(nft.image);
            }
          });
          
          // Cache the results
          collectionCache.set(cacheKey, {
            data: data.nfts,
            timestamp: now
          });
          
          return data.nfts;
        }
      }
      
      console.warn('Server endpoint failed, falling back to direct Helius API call');
    } catch (serverError) {
      console.error('Error using server endpoint:', serverError);
      console.warn('Falling back to direct Helius API call');
    }
    
    // Fallback: Direct Helius API call
    // First try to get the API key from the server config
    let heliusApiKey;
    try {
      const configResponse = await fetch(`${API_BASE_URL}/api/config`);
      if (configResponse.ok) {
        const config = await configResponse.json();
        heliusApiKey = config.HELIUS_API_KEY;
      }
    } catch (configError) {
      console.error('Error fetching config:', configError);
    }
    
    // Use client-side env var as a fallback
    if (!heliusApiKey) {
      heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
      console.log('Using client-side Helius API key');
    } else {
      console.log('Using server-provided Helius API key');
    }
    
    // Use hardcoded key as last resort
    if (!heliusApiKey) {
      heliusApiKey = '1aac55c4-5c9d-411a-bd46-37479a165e6d';
      console.log('Using hardcoded fallback Helius API key');
    }
    
    console.log('Helius API key available:', !!heliusApiKey);
    
    if (!heliusApiKey) {
      console.error('No Helius API key available');
      return [];
    }

    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=' + heliusApiKey, {
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

    const nfts = data.result.items.map((item: any) => ({
      mint: item.id,
      name: item.content?.metadata?.name || 'Untitled',
      image: item.content?.files?.[0]?.uri || item.content?.links?.image || '',
      description: item.content?.metadata?.description || '',
      owner: item.ownership?.owner ? {
        publicKey: item.ownership.owner,
        ownershipModel: item.ownership.ownershipModel || 'single',
        delegated: item.ownership.delegated || false,
        delegate: item.ownership.delegate || null,
        frozen: item.ownership.frozen || false
      } : ''
    }));
    
    // Preload the first few images
    nfts.slice(0, 12).forEach((nft: NFTMetadata) => {
      if (nft.image) {
        queueImagePreload(nft.image);
      }
    });
    
    // Cache the results
    collectionCache.set(cacheKey, {
      data: nfts,
      timestamp: now
    });
    
    console.log(`Fetched ${nfts.length} NFTs for collection ${collectionAddress}`);
    return nfts;
  } catch (error) {
    console.error('Error fetching collection NFTs:', error);
    return [];
  }
}; 