import { NFT } from '../types/nft';

/**
 * Retrieves NFTs from IndexedDB or falls back to localStorage
 * @returns Promise with array of NFTs
 */
export const getStoredNFTs = async (): Promise<NFT[]> => {
  try {
    // Try to get NFTs from localStorage first as a fallback
    const nftsJson = localStorage.getItem('nfts');
    if (nftsJson) {
      const nfts = JSON.parse(nftsJson);
      if (Array.isArray(nfts)) {
        console.log(`Retrieved ${nfts.length} NFTs from localStorage`);
        return nfts;
      }
    }
    
    // If no NFTs in localStorage, return empty array
    console.log('No NFTs found in storage');
    return [];
  } catch (error) {
    console.error('Error retrieving NFTs from storage:', error);
    return [];
  }
};

/**
 * Saves NFTs to localStorage
 * @param nfts Array of NFTs to save
 * @returns Promise that resolves when save is complete
 */
export const saveNFTs = async (nfts: NFT[]): Promise<void> => {
  try {
    localStorage.setItem('nfts', JSON.stringify(nfts));
    console.log(`Saved ${nfts.length} NFTs to localStorage`);
  } catch (error) {
    console.error('Error saving NFTs to storage:', error);
  }
}; 