import axios from 'axios';
import { NFT, NFTAttribute, NFTOwner } from '../types/nft';
import { fetchCollectionNFTs as fetchCollectionNFTsFromUtils, NFTMetadata } from '../utils/nftUtils';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';
import { processBatchWithSorting } from '../utils/nftSorting';

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// Interfaces for API responses
export interface Collection {
  address: string;
  name: string;
  image?: string;
  description?: string;
  addedAt?: number;
  creationDate?: string;
  ultimates?: boolean;
  collectionId?: string;
  firstNftDate?: string;
  type?: string;
}

export interface CollectionApiResponse {
  success: boolean;
  collections: Collection[];
}

/**
 * Convert NFTMetadata to the NFT type used by the application
 */
export const convertMetadataToNFT = (metadata: NFTMetadata): NFT => {
  // Create a base NFT object with required fields
  const nft: NFT = {
    mint: metadata.mint,
    name: metadata.name || 'Untitled',
    image: metadata.image || '',
    description: metadata.description || '',
    owner: metadata.owner || '',
    // Properties not in NFTMetadata - set defaults
    collectionName: '',
    listed: false,
    attributes: [],
    collectionAddress: '',
    creators: [],
    royalty: null,
    tokenStandard: null
  };

  // Add optional fields if they exist in metadata
  if (metadata.createdAt) nft.createdAt = metadata.createdAt;
  
  // Add collection info if available
  nft.collection = {
    name: '',
    address: '',
  };

  return nft;
};

/**
 * Fetch NFTs for a specific collection with retry mechanism
 */
export const fetchNFTsByCollection = async (collectionName: string): Promise<NFT[]> => {
  const maxRetries = 3;
  let retryCount = 0;
  let backoffDelay = 1000; // Start with 1 second delay
  
  while (retryCount < maxRetries) {
    try {
      const metadata = await fetchCollectionNFTsFromUtils(collectionName);
      
      // Map the NFTMetadata items to NFT objects
      const nfts = metadata.map(item => {
        const nft = convertMetadataToNFT(item);
        // Set collection name from the parameter
        nft.collectionName = collectionName;
        nft.collectionAddress = collectionName; // Use name as address if real address isn't available
        return nft;
      });
      
      return nfts;
    } catch (error) {
      retryCount++;
      console.error(`Error fetching NFTs (attempt ${retryCount}/${maxRetries}):`, error);
      
      if (retryCount >= maxRetries) {
        console.error(`Max retries reached for fetching NFTs from collection ${collectionName}`);
        return [];
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      backoffDelay *= 2; // Double the delay for next retry
    }
  }
  
  return [];
};

/**
 * Get all collections for the marketplace
 */
export const getUltimateAndRegularCollections = async (): Promise<{ ultimate: Collection[], regular: Collection[] }> => {
  try {
    const response = await axios.get<CollectionApiResponse>(`${API_BASE_URL}/api/collections`);
    
    if (response.data.success) {
      // Split collections into ultimate and regular
      const ultimateCollections = response.data.collections
        .filter(col => col.ultimates)
        .sort((a, b) => {
          if (a.addedAt && b.addedAt) {
            return b.addedAt - a.addedAt; // Sort by addedAt in descending order
          }
          return 0;
        });
      
      const regularCollections = response.data.collections
        .filter(col => !col.ultimates)
        .sort((a, b) => {
          if (a.addedAt && b.addedAt) {
            return b.addedAt - a.addedAt; // Sort by addedAt in descending order
          }
          return 0;
        });
      
      return { ultimate: ultimateCollections, regular: regularCollections };
    }
    
    console.error('Failed to get collections:', response.data);
    return { ultimate: [], regular: [] };
  } catch (error) {
    console.error('Error getting collections:', error);
    return { ultimate: [], regular: [] };
  }
};

/**
 * Optimize image preloading for NFTs
 */
export const preloadImages = async (nfts: NFT[]): Promise<void> => {
  // Don't preload if the global cache is not available
  if (typeof window === 'undefined' || !window.nftImageCache) {
    return;
  }
  
  const batchSize = 5; // Load 5 images at a time
  const delayBetweenBatches = 100; // 100ms delay between batches
  
  // Create batches of NFTs for preloading
  for (let i = 0; i < nfts.length; i += batchSize) {
    const batch = nfts.slice(i, i + batchSize);
    
    // Skip NFTs without images or already cached images
    const imagesToPreload = batch
      .filter(nft => nft.image && !window.nftImageCache.has(nft.image));
    
    // Preload images in this batch concurrently
    await Promise.all(
      imagesToPreload.map(nft => {
        return new Promise<void>((resolve) => {
          if (!nft.image) {
            resolve();
            return;
          }
          
          // Mark this image as being processed in the cache
          window.nftImageCache.set(nft.image, false);
          
          const img = new Image();
          
          img.onload = () => {
            window.nftImageCache.set(nft.image, true);
            resolve();
          };
          
          img.onerror = () => {
            window.nftImageCache.set(nft.image, false);
            resolve();
          };
          
          // Start loading
          img.src = nft.image;
        });
      })
    );
    
    // Add a small delay between batches to prevent overwhelming the browser
    if (i + batchSize < nfts.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
};

/**
 * Fetch all NFTs with UI updates and optional sorting
 */
export const fetchAllNFTs = async (
  sorted: boolean,
  updateUi: (nfts: NFT[]) => void,
  updateMessage: (message: string) => void
): Promise<NFT[]> => {
  // Get display names for wallet addresses
  updateMessage('Syncing display names...');
  try {
    await syncDisplayNamesFromSheets();
  } catch (error) {
    console.error('Error syncing display names:', error);
  }
  
  // Load collections from marketplace API
  updateMessage('Loading collections...');
  const { ultimate, regular } = await getUltimateAndRegularCollections();
  
  // Array to store all fetched NFTs
  let allNFTs: NFT[] = [];
  
  // Process ultimate collections (typically fewer but special)
  if (ultimate.length > 0) {
    updateMessage(`Loading Ultimate collections (${ultimate.length})...`);
    
    // Process each Ultimate collection
    for (let i = 0; i < ultimate.length; i++) {
      const collection = ultimate[i];
      updateMessage(`Loading ${collection.name} (${i + 1}/${ultimate.length})...`);
      
      try {
        const nfts = await fetchNFTsByCollection(collection.address);
        
        // Process this batch with optional sorting
        allNFTs = processBatchWithSorting(allNFTs, nfts, sorted);
        
        // Update UI with current NFTs
        updateUi(allNFTs);
        
        // Preload images for better UX
        await preloadImages(nfts);
      } catch (error) {
        console.error(`Error fetching Ultimate collection ${collection.name}:`, error);
      }
    }
  }
  
  // Process regular collections (typically more but standard)
  if (regular.length > 0) {
    updateMessage(`Loading regular collections (${regular.length})...`);
    
    // Process each regular collection
    for (let i = 0; i < regular.length; i++) {
      const collection = regular[i];
      updateMessage(`Loading ${collection.name} (${i + 1}/${regular.length})...`);
      
      try {
        const nfts = await fetchNFTsByCollection(collection.address);
        
        // Process this batch with optional sorting
        allNFTs = processBatchWithSorting(allNFTs, nfts, sorted);
        
        // Update UI with current progress
        updateUi(allNFTs);
        
        // Preload images for better UX
        await preloadImages(nfts);
      } catch (error) {
        console.error(`Error fetching regular collection ${collection.name}:`, error);
      }
    }
  }
  
  // Final processing step for the complete dataset
  if (sorted && allNFTs.length > 0) {
    updateMessage('Finalizing sort order...');
    allNFTs = processBatchWithSorting(allNFTs, [], sorted);
    updateUi(allNFTs);
  }
  
  updateMessage('Loading complete');
  return allNFTs;
}; 