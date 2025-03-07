import { GOOGLE_SHEETS_CONFIG, get, sheets, createSheetsClient, SheetResponse } from './googleSheetsConfig';
import { API_BASE_URL } from './config';
import axios from 'axios';

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
  "NFT Address": string;
  "Name": string;
  "Owner": string;
  "collection_id": string;
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
 * Fetch with timeout utility
 */
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

/**
 * Fetch data from Google Sheets with improved error handling
 */
const fetchFromGoogleSheets = async <T>(sheetName: string): Promise<T[]> => {
  try {
    console.log(`Fetching data from Google Sheets: ${sheetName}`);
    const url = `${API_BASE_URL}/api/sheets/${sheetName}`;
    console.log(`API URL: ${url}`);
    
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      // Remove credentials to avoid CORS issues
      // credentials: 'include'
    }, FETCH_TIMEOUT);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching from Google Sheets (${sheetName}):`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Received data from ${sheetName}:`, result);
    
    if (!result.success || !result.data || !Array.isArray(result.data)) {
      console.error(`Invalid response format from ${sheetName}:`, result);
      throw new Error('Invalid response format');
    }

    return result.data;
  } catch (error) {
    console.error(`Error in fetchFromGoogleSheets (${sheetName}):`, error);
    throw error;
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
    // Try to get from cache first
    const cachedUltimates = localStorage.getItem('ultimates_cache');
    if (cachedUltimates) {
      const { data, timestamp } = JSON.parse(cachedUltimates);
      // Check if cache is less than 5 minutes old
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        console.log('Using cached ultimates data');
        return data;
      }
    }

    // Fetch fresh data from API
    console.log('Fetching ultimates from API...');
    const response = await axios.get(`${API_BASE_URL}/api/sheets/ultimates`);
    
    if (!response.data.success) {
      throw new Error('Failed to fetch ultimates data');
    }

    console.log('Raw ultimates data:', response.data.data);

    // Transform and validate the data
    const validUltimates = response.data.data
      .filter((item: any) => {
        const isValid = item && 
          typeof item === 'object' &&
          item.nft_address && 
          typeof item.nft_address === 'string' &&
          item.nft_address.trim().length > 0 &&
          item.collection_id && 
          typeof item.collection_id === 'string' &&
          item.collection_id.trim().length > 0;

        if (!isValid) {
          console.warn('Invalid ultimate NFT data:', item);
        }
        return isValid;
      })
      .map((item: any) => ({
        nft_address: item.nft_address.trim(),
        name: item.name || 'Unnamed Ultimate',
        owner: item.owner || '',
        collection_id: item.collection_id.trim()
      }));

    console.log('Processed ultimates:', {
      total: validUltimates.length,
      items: validUltimates
    });

    // Cache the validated data
    localStorage.setItem('ultimates_cache', JSON.stringify({
      data: validUltimates,
      timestamp: Date.now()
    }));

    console.log(`Processed ${validUltimates.length} valid ultimate NFTs`);
    return validUltimates;
  } catch (error) {
    console.error('Error fetching ultimate NFTs:', error);
    
    // Try to use cached data even if it's old
    const cachedUltimates = localStorage.getItem('ultimates_cache');
    if (cachedUltimates) {
      const { data } = JSON.parse(cachedUltimates);
      console.log('Using expired cached ultimates data due to fetch error');
      return data;
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