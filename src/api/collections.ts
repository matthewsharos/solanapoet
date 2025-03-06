import { GOOGLE_SHEETS_CONFIG, get, sheets, createSheetsClient, SheetResponse } from './googleSheetsConfig';

/**
 * Type definition for a collection
 */
export interface Collection {
  address: string;
  name: string;
  image?: string;
  description?: string;
  addedAt: number;
  creationDate?: string;
  ultimates?: boolean;
}

// Add new type for ultimate NFT entries
export interface UltimateNFT {
  nft_address: string;
  name: string;
  owner: string;
  collection_id: string;
}

// Timeout for fetch requests in milliseconds
const FETCH_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 2000; // 2 seconds base delay

// Cache for Google Sheets data
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
}

type CacheType = {
  collections?: CacheEntry<Collection>;
  ultimates?: CacheEntry<UltimateNFT>;
};

const cache: CacheType = {};

function isCacheValid<T>(cacheEntry: CacheEntry<T>): boolean {
  return Date.now() - cacheEntry.timestamp < CACHE_DURATION;
}

/**
 * Sleep utility function
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Local storage keys
const LS_KEYS = {
  COLLECTIONS: 'collections_cache',
  ULTIMATES: 'ultimates_cache',
  TIMESTAMP: 'cache_timestamp'
};

// Save to local storage with timestamp
const saveToLocalStorage = <T>(key: string, data: T[]) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

// Get from local storage with timestamp check
const getFromLocalStorage = <T>(key: string): { data: T[], timestamp: number } | null => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return null;
  }
};

/**
 * Get collections from localStorage
 */
const getLocalStorageCollections = (): Collection[] => {
  try {
    const storedCollections = localStorage.getItem('collections');
    if (!storedCollections) return [];
    const collections = JSON.parse(storedCollections);
    console.log('Retrieved collections from localStorage:', collections.length);
    return collections;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return [];
  }
};

/**
 * Ensure Google Sheets client is initialized
 */
const ensureSheetsClient = async () => {
  if (!sheets) {
    console.log('Sheets client not initialized, creating new client...');
    const newClient = await createSheetsClient();
    return newClient;
  }
  return sheets;
};

// Helper function for exponential backoff
const exponentialBackoff = async (attempt: number) => {
  const delay = Math.min(
    BASE_RETRY_DELAY * Math.pow(2, attempt),
    60000 // Cap at 1 minute
  );
  await new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Fetch from Google Sheets with retry logic and rate limiting
 */
const fetchFromGoogleSheets = async <T extends Collection | UltimateNFT>(
  sheetName: string,
  retries = MAX_RETRIES
): Promise<T[]> => {
  try {
    // Check cache first
    const cacheKey = sheetName as keyof CacheType;
    const cacheEntry = cache[cacheKey] as CacheEntry<T> | undefined;
    if (cacheEntry && isCacheValid(cacheEntry)) {
      console.log(`Using cached data for ${sheetName}`);
      return cacheEntry.data;
    }

    // If we're retrying, add exponential backoff
    if (retries < MAX_RETRIES) {
      await exponentialBackoff(MAX_RETRIES - retries);
    }

    const response = await get(sheetName);
    
    // Handle rate limiting
    const retryAfter = response.retryAfter || 0;
    if (!response.success && retryAfter > 0) {
      console.log(`Rate limited, waiting ${retryAfter} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return fetchFromGoogleSheets(sheetName, retries - 1);
    }

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch from Google Sheets');
    }

    // Update cache
    const newCacheEntry: CacheEntry<T> = {
      data: response.data as T[],
      timestamp: Date.now()
    };
    
    if (sheetName === GOOGLE_SHEETS_CONFIG.sheets.collections) {
      cache.collections = newCacheEntry as CacheEntry<Collection>;
    } else if (sheetName === GOOGLE_SHEETS_CONFIG.sheets.ultimates) {
      cache.ultimates = newCacheEntry as CacheEntry<UltimateNFT>;
    }

    return response.data as T[];
  } catch (error: any) {
    console.error('Error fetching from Google Sheets:', error);
    
    // If we have cached data, return it even if expired
    const cacheKey = sheetName as keyof CacheType;
    const cacheEntry = cache[cacheKey] as CacheEntry<T> | undefined;
    if (cacheEntry) {
      console.log(`Using expired cache for ${sheetName} due to error`);
      return cacheEntry.data;
    }
    
    // If no cache and retries left, try again
    if (retries > 0) {
      console.log(`Retrying fetch for ${sheetName}, ${retries} attempts remaining`);
      await exponentialBackoff(MAX_RETRIES - retries);
      return fetchFromGoogleSheets(sheetName, retries - 1);
    }
    
    return [];
  }
};

/**
 * Fetch all collections from Google Sheets with improved caching
 */
export const fetchCollections = async (): Promise<Collection[]> => {
  try {
    // Check memory cache first
    if (cache.collections && isCacheValid(cache.collections)) {
      return cache.collections.data;
    }

    // Check local storage cache next
    const localCache = getFromLocalStorage<Collection>(LS_KEYS.COLLECTIONS);
    if (localCache && Date.now() - localCache.timestamp < CACHE_DURATION) {
      // Update memory cache
      cache.collections = {
        data: localCache.data,
        timestamp: localCache.timestamp
      };
      return localCache.data;
    }

    // Fetch from Google Sheets
    const collections = await fetchFromGoogleSheets<Collection>(GOOGLE_SHEETS_CONFIG.sheets.collections);
    
    // Update both caches
    const newCache = {
      data: collections,
      timestamp: Date.now()
    };
    cache.collections = newCache;
    saveToLocalStorage(LS_KEYS.COLLECTIONS, collections);

    return collections;
  } catch (error) {
    console.error('Error fetching collections:', error);
    
    // Try to return local storage cache even if expired
    const localCache = getFromLocalStorage<Collection>(LS_KEYS.COLLECTIONS);
    if (localCache) {
      return localCache.data;
    }
    
    return [];
  }
};

/**
 * Get a specific collection by address
 */
export const getCollection = async (address: string): Promise<Collection | null> => {
  try {
    const collections = await fetchCollections();
    return collections.find(collection => collection.address === address) || null;
  } catch (error) {
    console.error('Error getting collection:', error);
    return null;
  }
};

/**
 * Add a collection to Google Sheets
 */
export const addCollection = async (collection: Collection): Promise<boolean> => {
  try {
    if (!collection.address) {
      console.error('Invalid collection: missing address');
      return false;
    }

    // First fetch existing collections to check for duplicates
    const collections = await fetchCollections();
    if (collections.some(c => c.address === collection.address)) {
      console.warn(`Collection with address ${collection.address} already exists`);
      return false;
    }

    const sheetsClient = await ensureSheetsClient();

    // Prepare the data to append in the correct column order
    const values = [[
      collection.address,
      collection.name,
      collection.image || '',
      collection.description || '',
      collection.addedAt.toString(),
      collection.creationDate || '',
      collection.ultimates ? 'TRUE' : ''
    ]];

    // Append to Google Sheets
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
      valueInputOption: 'RAW',
      requestBody: {
        values
      }
    });

    console.log('Successfully added collection to Google Sheets');
    return true;
  } catch (error) {
    console.error('Error adding collection:', error);
    return false;
  }
};

/**
 * Remove a collection by address from Google Sheets
 */
export const removeCollection = async (address: string): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to delete
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Delete the row
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // You'll need to get the actual sheet ID
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    console.log('Successfully removed collection from Google Sheets');
    return true;
  } catch (error) {
    console.error('Error removing collection:', error);
    
    // Fallback to localStorage
    try {
      const collections = await fetchCollections();
      const updatedCollections = collections.filter(c => c.address !== address);
      localStorage.setItem('collections', JSON.stringify(updatedCollections));
      console.log('Removed collection from localStorage as fallback');
      return true;
    } catch (e) {
      console.error('Failed to remove collection from localStorage fallback:', e);
      return false;
    }
  }
};

/**
 * Check if a collection exists by address
 */
export const collectionExists = async (address: string): Promise<boolean> => {
  const collections = await fetchCollections();
  return collections.some(c => c.address === address);
};

/**
 * Update a collection's name and ultimates in Google Sheets
 */
export const updateCollection = async (address: string, name: string, ultimates?: boolean): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to update
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Update both name and ultimates columns
    const nameRange = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!B${rowIndex + 1}`;
    const ultimatesRange = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!G${rowIndex + 1}`;

    // Update name
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: nameRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name]]
      }
    });

    // Update ultimates if provided
    if (ultimates !== undefined) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: ultimatesRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[ultimates ? 'TRUE' : '']]
        }
      });
    }

    console.log('Successfully updated collection in Google Sheets');
    return true;
  } catch (error) {
    console.error('Error updating collection:', error);
    return false;
  }
};

/**
 * Update a collection's ultimates in Google Sheets
 */
export const updateCollectionUltimates = async (address: string, ultimates: string[]): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to update
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Update just the ultimates column (index 7) in the found row
    const range = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!H${rowIndex + 1}`;
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[ultimates.join(',')]]
      }
    });

    console.log('Successfully updated collection ultimates in Google Sheets');
    return true;
  } catch (error) {
    console.error('Error updating collection ultimates:', error);
    return false;
  }
};

/**
 * Get all ultimate NFTs with improved caching
 */
export const getUltimateNFTs = async (): Promise<UltimateNFT[]> => {
  try {
    // Check memory cache first
    if (cache.ultimates && isCacheValid(cache.ultimates)) {
      return cache.ultimates.data;
    }

    // Check local storage cache next
    const localCache = getFromLocalStorage<UltimateNFT>(LS_KEYS.ULTIMATES);
    if (localCache && Date.now() - localCache.timestamp < CACHE_DURATION) {
      // Update memory cache
      cache.ultimates = {
        data: localCache.data,
        timestamp: localCache.timestamp
      };
      return localCache.data;
    }

    // Fetch from Google Sheets
    const ultimates = await fetchFromGoogleSheets<UltimateNFT>(GOOGLE_SHEETS_CONFIG.sheets.ultimates);
    
    // Update both caches
    const newCache = {
      data: ultimates,
      timestamp: Date.now()
    };
    cache.ultimates = newCache;
    saveToLocalStorage(LS_KEYS.ULTIMATES, ultimates);

    return ultimates;
  } catch (error) {
    console.error('Error fetching ultimate NFTs:', error);
    
    // Try to return local storage cache even if expired
    const localCache = getFromLocalStorage<UltimateNFT>(LS_KEYS.ULTIMATES);
    if (localCache) {
      return localCache.data;
    }
    
    return [];
  }
};

/**
 * Add an ultimate NFT to the ultimates sheet
 */
export const addUltimateNFT = async (nft: UltimateNFT): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Check if NFT already exists
    const existingNFTs = await getUltimateNFTs();
    if (existingNFTs.some(existing => existing.nft_address === nft.nft_address)) {
      console.warn('NFT already exists in ultimates sheet');
      return false;
    }

    // Append the new NFT
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.ultimates),
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          nft.nft_address,
          nft.name || '',
          nft.owner || '',
          nft.collection_id
        ]]
      }
    });

    console.log('Successfully added ultimate NFT to sheet');
    return true;
  } catch (error) {
    console.error('Error adding ultimate NFT:', error);
    return false;
  }
};

/**
 * Remove an ultimate NFT from the ultimates sheet
 */
export const removeUltimateNFT = async (collectionAddress: string, nftAddress: string): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to delete
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.ultimates),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => 
      row[0] === collectionAddress && row[1] === nftAddress
    );

    if (rowIndex === -1) {
      console.warn('Ultimate NFT not found');
      return false;
    }

    // Delete the row
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // You'll need to get the actual sheet ID
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    console.log('Successfully removed ultimate NFT');
    return true;
  } catch (error) {
    console.error('Error removing ultimate NFT:', error);
    return false;
  }
};

/**
 * Get the full range for a sheet
 */
const getSheetRange = (sheetName: string) => `${sheetName}!A:Z`; 