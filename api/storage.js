import { openDB } from 'idb';

// Database name and version
const DB_NAME = 'solana-marketplace-db';
const DB_VERSION = 1;

// Open or create the database
export async function getDb() {
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
export async function saveCollections(collections) {
  const db = await getDb();
  const tx = db.transaction('collections', 'readwrite');
  await tx.objectStore('collections').put(collections, 'allCollections');
  await tx.done;
  console.log('Collections saved to IndexedDB:', collections);
}

export async function getCollections() {
  try {
    const db = await getDb();
    const collections = await db.get('collections', 'allCollections');
    return collections || [];
  } catch (error) {
    console.error('Error getting collections from IndexedDB:', error);
    return [];
  }
}

// Listing management
export async function saveListing(mint, price, ownerPublicKey) {
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

export async function removeListing(mint) {
  const db = await getDb();
  const tx = db.transaction('listings', 'readwrite');
  await tx.objectStore('listings').delete(mint);
  await tx.done;
  console.log(`Listing removed from IndexedDB for mint: ${mint}`);
}

export async function getListing(mint) {
  try {
    const db = await getDb();
    return await db.get('listings', mint);
  } catch (error) {
    console.error(`Error getting listing for mint ${mint} from IndexedDB:`, error);
    return undefined;
  }
}

export async function getAllListings() {
  try {
    const db = await getDb();
    return await db.getAll('listings');
  } catch (error) {
    console.error('Error getting all listings from IndexedDB:', error);
    return [];
  }
}

// Import/Export functions for marketplace data
export function exportMarketplaceData() {
  return new Promise(async (resolve) => {
    try {
      const collections = await getCollections();
      const listings = await getAllListings();
      
      const data = { collections, listings };
      const jsonData = JSON.stringify(data, null, 2);
      
      resolve(jsonData);
    } catch (error) {
      console.error('Error exporting marketplace data:', error);
      resolve(JSON.stringify({ collections: [], listings: [] }));
    }
  });
}

export async function importMarketplaceData(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    
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
export async function applyPersistedListingsToNFTs(nfts) {
  const listings = await getAllListings();
  const listingsByMint = new Map();
  
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
export function downloadMarketplaceData(filename = 'marketplace-data.json') {
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
export function uploadMarketplaceData() {
  return new Promise((resolve) => {
    try {
      // Create file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.onchange = async (event) => {
        const target = event.target;
        const file = target.files?.[0];
        
        if (file) {
          try {
            // Read the file
            const reader = new FileReader();
            reader.onload = async (e) => {
              const jsonData = e.target?.result;
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
export async function syncCollectionsFromLocalStorage() {
  try {
    const storedCollections = localStorage.getItem('collections');
    if (storedCollections) {
      const collections = JSON.parse(storedCollections);
      if (Array.isArray(collections)) {
        await saveCollections(collections);
        return collections;
      }
    }
    return [];
  } catch (error) {
    console.error('Error syncing collections from localStorage:', error);
    return [];
  }
} 