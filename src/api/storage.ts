import { openDB, IDBPDatabase } from 'idb';
import { NFT } from '../types/nft';

interface NFTListing {
  mint: string;
  price: number;
  ownerPublicKey: string;
}

interface MarketplaceData {
  collections: string[];
  listings: NFTListing[];
}

// Database name and version
const DB_NAME = 'solana-marketplace-db';
const DB_VERSION = 1;

// Open or create the database
export async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections');
      }
      if (!db.objectStoreNames.contains('listings')) {
        db.createObjectStore('listings', { keyPath: 'mint' });
      }
    },
  });
}

// Collection management
export async function saveCollections(collections: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('collections', 'readwrite');
  await tx.objectStore('collections').put(collections, 'allCollections');
  await tx.done;
  console.log('Collections saved to IndexedDB:', collections);
}

export async function getCollections(): Promise<string[]> {
  try {
    const db = await getDb();
    const collections = await db.get('collections', 'allCollections') as string[] | undefined;
    return collections || [];
  } catch (error) {
    console.error('Error getting collections from IndexedDB:', error);
    return [];
  }
}

// Listing management
export async function saveListing(mint: string, price: number, ownerPublicKey: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('listings', 'readwrite');
  await tx.objectStore('listings').put({
    mint,
    price,
    ownerPublicKey
  });
  await tx.done;
  console.log(`Listing saved to IndexedDB for mint: ${mint} with price: ${price}`);
}

export async function removeListing(mint: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('listings', 'readwrite');
  await tx.objectStore('listings').delete(mint);
  await tx.done;
  console.log(`Listing removed from IndexedDB for mint: ${mint}`);
}

export async function getListing(mint: string): Promise<NFTListing | undefined> {
  try {
    const db = await getDb();
    return await db.get('listings', mint);
  } catch (error) {
    console.error(`Error getting listing for mint ${mint} from IndexedDB:`, error);
    return undefined;
  }
}

export async function getAllListings(): Promise<NFTListing[]> {
  try {
    const db = await getDb();
    return await db.getAll('listings');
  } catch (error) {
    console.error('Error getting all listings from IndexedDB:', error);
    return [];
  }
}

// Import/Export functions for marketplace data
export function exportMarketplaceData(): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const collections = await getCollections();
      const listings = await getAllListings();
      
      const data: MarketplaceData = { collections, listings };
      const jsonData = JSON.stringify(data, null, 2);
      
      resolve(jsonData);
    } catch (error) {
      console.error('Error exporting marketplace data:', error);
      resolve(JSON.stringify({ collections: [], listings: [] }));
    }
  });
}

export async function importMarketplaceData(jsonData: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonData) as MarketplaceData;
    
    // Validate data format
    if (!data.collections || !Array.isArray(data.collections) || 
        !data.listings || !Array.isArray(data.listings)) {
      throw new Error('Invalid data format');
    }
    
    // Save collections
    await saveCollections(data.collections);
    
    // Save listings (clear existing first)
    const db = await getDb();
    const tx = db.transaction('listings', 'readwrite');
    const store = tx.objectStore('listings');
    await store.clear();
    
    // Add new listings
    for (const listing of data.listings) {
      await store.add(listing);
    }
    
    await tx.done;
    console.log('Marketplace data successfully imported');
    return true;
  } catch (error) {
    console.error('Error importing marketplace data:', error);
    return false;
  }
}

// Apply persisted listings to NFTs
export async function applyPersistedListingsToNFTs<T extends { mint: string }>(nfts: T[]): Promise<T[]> {
  const listings = await getAllListings();
  const listingsByMint = new Map<string, NFTListing>();
  
  // Create a map for quick lookup
  listings.forEach(listing => {
    listingsByMint.set(listing.mint, listing);
  });
  
  // Apply listings to NFTs
  return nfts.map(nft => {
    const listing = listingsByMint.get(nft.mint);
    
    if (listing) {
      return {
        ...nft,
        price: listing.price,
        listed: true
      };
    }
    
    return nft;
  });
}

// Function to download marketplace data as a JSON file
export function downloadMarketplaceData(filename = 'marketplace-data.json'): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      const jsonData = await exportMarketplaceData();
      
      // Create a blob with the JSON data
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create a link to download the file
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      }, 100);
    } catch (error) {
      console.error('Error downloading marketplace data:', error);
      resolve();
    }
  });
}

// Function to upload and import marketplace data from a JSON file
export function uploadMarketplaceData(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Create file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.onchange = async (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (file) {
          try {
            // Read the file
            const reader = new FileReader();
            reader.onload = async (e) => {
              const jsonData = e.target?.result as string;
              const success = await importMarketplaceData(jsonData);
              resolve(success);
            };
            reader.readAsText(file);
          } catch (error) {
            console.error('Error reading file:', error);
            resolve(false);
          }
        } else {
          resolve(false);
        }
        
        // Clean up
        document.body.removeChild(fileInput);
      };
      
      // Trigger file selection
      document.body.appendChild(fileInput);
      fileInput.click();
    } catch (error) {
      console.error('Error uploading marketplace data:', error);
      resolve(false);
    }
  });
}

/**
 * Syncs collections between localStorage and IndexedDB.
 * This ensures both the Mint page and Market page use the same collection list.
 */
export async function syncCollectionsFromLocalStorage(): Promise<string[]> {
  try {
    // Get collections from localStorage (used by Mint page)
    const storedCollections = localStorage.getItem('collections');
    let collections: { collectionId: string; name: string; }[] = [];
    
    if (storedCollections) {
      collections = JSON.parse(storedCollections);
      console.log(`Found ${collections.length} collections in localStorage from Mint page`);
    } else {
      console.log('No collections found in localStorage - Market will have no collections to display');
    }
    
    // Extract just the collection IDs
    const collectionIds = collections.map(c => c.collectionId);
    
    // Update IndexedDB with these collection IDs
    if (collectionIds.length > 0) {
      await saveCollections(collectionIds);
      console.log(`Synced ${collectionIds.length} collections from Mint page to Market page:`, collectionIds);
    } else {
      // Save an empty array to clear any previous collections
      await saveCollections([]);
      console.log('Cleared collections in IndexedDB as no collections found in localStorage');
    }
    
    return collectionIds;
  } catch (error) {
    console.error('Error syncing collections from localStorage:', error);
    // In case of error, try to get what's already in IndexedDB
    try {
      return await getCollections();
    } catch (e) {
      console.error('Failed to get collections from IndexedDB as fallback:', e);
      return [];
    }
  }
} 