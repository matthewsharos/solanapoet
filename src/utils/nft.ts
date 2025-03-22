import { NFT } from '../types/nft';

/**
 * Parses and normalizes NFT creation dates from various possible formats
 * Returns the date as an ISO string and blockTime if available
 */
export const parseNFTCreationDate = (nftData: any, collectionData?: any): { createdAt: string; blockTime: number | null } => {
  // Start with assuming no valid dates
  let createdAt = null;
  let blockTime = null;
  
  // Try to extract blockTime (which is most reliable)
  if (nftData.blockTime) {
    blockTime = nftData.blockTime;
    return {
      createdAt: new Date(blockTime * 1000).toISOString(),
      blockTime
    };
  }

  // Check direct createdAt field
  if (nftData.createdAt) {
    // Handle numeric timestamp stored as string
    if (/^\d+$/.test(nftData.createdAt)) {
      const timestamp = parseInt(nftData.createdAt);
      // Check if it's in seconds (blockTime) or milliseconds
      if (timestamp < 10000000000) { // If in seconds (before year 2286)
        blockTime = timestamp;
        return {
          createdAt: new Date(timestamp * 1000).toISOString(),
          blockTime
        };
      } else {
        return {
          createdAt: new Date(timestamp).toISOString(),
          blockTime: null
        };
      }
    }
    
    // Try to parse as ISO string
    try {
      const date = new Date(nftData.createdAt);
      if (!isNaN(date.getTime())) {
        return {
          createdAt: date.toISOString(),
          blockTime: null
        };
      }
    } catch (e) {
      // Ignore parsing errors and continue
    }
  }

  // Try metadata fields
  createdAt = nftData.content?.metadata?.created_at || 
              nftData.compression?.created_at ||
              nftData.content?.metadata?.attributes?.find((attr: any) => 
                attr.trait_type?.toLowerCase() === 'created' || 
                attr.trait_type?.toLowerCase() === 'creation date'
              )?.value;
  
  if (createdAt) {
    try {
      const date = new Date(createdAt);
      if (!isNaN(date.getTime())) {
        return {
          createdAt: date.toISOString(),
          blockTime: null
        };
      }
    } catch (e) {
      // Ignore parsing errors and continue
    }
  }

  // If no date found, use collection date as fallback
  if (collectionData) {
    createdAt = collectionData.creationDate || 
                collectionData.firstNftDate;
                
    if (createdAt) {
      try {
        const date = new Date(createdAt);
        if (!isNaN(date.getTime())) {
          return {
            createdAt: date.toISOString(),
            blockTime: null
          };
        }
      } catch (e) {
        // Ignore parsing errors and continue
      }
    }
  }

  // Last resort - use current time with a small random offset to prevent sorting issues
  const now = Date.now();
  const randomOffset = Math.floor(Math.random() * 60000); // Random offset up to 1 minute
  return {
    createdAt: new Date(now - randomOffset).toISOString(),
    blockTime: null
  };
};

/**
 * Compare two NFTs by creation date (newer first)
 * A unified, deterministic approach to comparing NFT creation dates
 */
export const compareNFTsByCreationDate = (a: NFT, b: NFT, descending = true): number => {
  // Try to get dates as millisecond timestamps
  let dateA: number | null = null;
  let dateB: number | null = null;
  
  // Try parsing createdAt
  if (a.createdAt) {
    if (/^\d+$/.test(a.createdAt)) {
      dateA = parseInt(a.createdAt);
    } else {
      const dateObj = new Date(a.createdAt);
      if (!isNaN(dateObj.getTime())) {
        dateA = dateObj.getTime();
      }
    }
  }
  
  if (b.createdAt) {
    if (/^\d+$/.test(b.createdAt)) {
      dateB = parseInt(b.createdAt);
    } else {
      const dateObj = new Date(b.createdAt);
      if (!isNaN(dateObj.getTime())) {
        dateB = dateObj.getTime();
      }
    }
  }

  // Compare the dates if we have them
  if (dateA !== null && dateB !== null) {
    return descending ? dateB - dateA : dateA - dateB;
  }
  
  // Handle cases where one or both dates are missing
  if (dateA !== null) return descending ? -1 : 1;
  if (dateB !== null) return descending ? 1 : -1;
  
  // If neither has a date, sort by mint for consistency
  return a.mint.localeCompare(b.mint);
}; 