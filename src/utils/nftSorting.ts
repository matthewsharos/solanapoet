import { NFT } from '../types/nft';
import { parseNFTCreationDate, compareNFTsByCreationDate } from './nft';

// Define the extended NFT interface for our implementation
export interface ExtendedNFT extends NFT {
  blockTime?: string;
  updateAuthority?: string;
  metadata?: {
    name?: string;
    attributes?: {
      trait_type?: string;
      value: string;
    }[];
    properties?: {
      date?: string;
    };
  };
}

// Helper function for parsing dates from extended NFT properties
export const enhancedParseNFTDate = (nft: ExtendedNFT): Date | null => {
  try {
    // For special collections
    const isDripUltimate = nft.name?.includes("Drip Ultimate") || nft.collection?.name?.includes("Drip Ultimate");
    const isPhysical = nft.name?.includes("Physical") || nft.collection?.name?.includes("Physical");
    
    if (isDripUltimate || isPhysical) {
      console.log(`Special collection NFT: ${nft.name}`);
      
      // Try blockTime first
      if (nft.blockTime) {
        const blockTime = parseInt(nft.blockTime);
        if (!isNaN(blockTime)) {
          return new Date(blockTime * 1000);
        }
      }
      
      // Try updateAuthority (sometimes contains timestamp)
      if (nft.updateAuthority) {
        const timestamp = parseInt(nft.updateAuthority);
        if (!isNaN(timestamp) && timestamp > 1000000000) { // Sanity check for Unix timestamp
          return new Date(timestamp * 1000);
        }
      }
      
      // Try compression.created_at
      if (nft.compression?.created_at) {
        const date = new Date(nft.compression.created_at);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      
      // Try content.metadata
      if (nft.content?.metadata?.created_at) {
        const date = new Date(nft.content.metadata.created_at);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error parsing special date for NFT:", nft.name, error);
    return null;
  }
};

// Enhanced sort function that works for all collections
export const enhancedSortNFTsByCreationDate = (nfts: NFT[]): NFT[] => {
  if (!nfts || nfts.length === 0) return [];
  
  return [...nfts].sort((a, b) => {
    // Try to use the existing parseNFTCreationDate function first
    const dateA = parseNFTCreationDate(a);
    const dateB = parseNFTCreationDate(b);
    
    // If both dates are parsed, compare them normally
    if (dateA && dateB) {
      return compareNFTsByCreationDate(a, b);
    }
    
    // If only one date is valid, prioritize the one with valid date
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    
    // Additional handling for special collections
    const extendedA = a as ExtendedNFT;
    const extendedB = b as ExtendedNFT;
    
    // Try to get dates from other sources for problematic collections
    const specialDateA = enhancedParseNFTDate(extendedA);
    const specialDateB = enhancedParseNFTDate(extendedB);
    
    if (specialDateA && specialDateB) {
      return specialDateB.getTime() - specialDateA.getTime(); // Descending order
    }
    
    if (specialDateA) return -1;
    if (specialDateB) return 1;
    
    // If we still can't determine dates, sort by collection name
    const collectionA = extendedA.collection?.name || extendedA.collectionName || '';
    const collectionB = extendedB.collection?.name || extendedB.collectionName || '';
    
    return collectionA.localeCompare(collectionB);
  });
};

// Enhanced processing function that works during loading
export const processBatchWithSorting = (accumulator: NFT[], newBatch: NFT[], sorted: boolean): NFT[] => {
  const combinedNFTs = [...accumulator, ...newBatch];
  return sorted ? enhancedSortNFTsByCreationDate(combinedNFTs) : combinedNFTs;
}; 