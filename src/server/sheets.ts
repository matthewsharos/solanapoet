import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface SheetValues {
  values?: any[][] | null;
}

interface AppendResponse {
  spreadsheetId?: string | null;
  tableRange?: string | null;
  updates?: {
    spreadsheetId?: string | null;
    updatedRange?: string | null;
    updatedRows?: number | null;
    updatedColumns?: number | null;
    updatedCells?: number | null;
  };
}

interface UpdateResponse {
  spreadsheetId?: string | null;
  updatedRange?: string | null;
  updatedRows?: number | null;
  updatedColumns?: number | null;
  updatedCells?: number | null;
}

interface BatchUpdateResponse {
  spreadsheetId?: string | null;
  responses?: sheets_v4.Schema$Response[] | null;
}

// Initialize Google Sheets API
let auth: OAuth2Client | null = null;

// Initialize Google Sheets auth
export const getGoogleAuth = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Google credentials not set. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
    }

    console.log('Initializing auth using individual credentials');
    
    // Process private key to handle escaped newlines
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
      console.log('Converting escaped newlines in private key to actual newlines');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    return auth;
  } catch (error) {
    console.error('Error initializing Google auth:', error);
    throw error;
  }
};

// Enhanced cache configuration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<any>>();

// Define different TTLs based on how frequently the data changes
const CACHE_TTL = {
  default: 60000, // 1 minute default TTL
  listings: 5 * 60000, // 5 minutes for listings (changes frequently)
  collections: 15 * 60000, // 15 minutes for collections (changes occasionally)
  display_names: 30 * 60000, // 30 minutes for display names (changes rarely)
  ultimates: 60 * 60000, // 1 hour for ultimates (changes very rarely)
};

const CACHE_SIZE_LIMIT = 100; // Limit cache size to prevent memory issues
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

// Track cache metrics
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

interface GoogleSheetsError extends Error {
  code?: number;
}

// Helper to get the appropriate TTL based on sheet range
const getTTLForSheet = (range: string): number => {
  const lowerRange = range.toLowerCase();
  
  if (lowerRange.includes('listing') || lowerRange === 'listings') {
    return CACHE_TTL.listings;
  } else if (lowerRange.includes('collection') || lowerRange === 'collections') {
    return CACHE_TTL.collections;
  } else if (lowerRange.includes('display_name') || lowerRange === 'display_names') {
    return CACHE_TTL.display_names;
  } else if (lowerRange.includes('ultimate') || lowerRange === 'ultimates') {
    return CACHE_TTL.ultimates;
  }
  
  return CACHE_TTL.default;
};

// Log cache statistics periodically
const logCacheStats = () => {
  if (cacheHits % 10 === 0 && cacheHits > 0) {
    console.log(`[Sheets Cache] Stats - Hits: ${cacheHits}, Misses: ${cacheMisses}, Evictions: ${cacheEvictions}, Size: ${cache.size}`);
  }
};

// Clear expired cache entries
const clearExpiredEntries = () => {
  const now = Date.now();
  let cleared = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key);
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.log(`[Sheets Cache] Cleared ${cleared} expired entries`);
  }
};

// Get values from a sheet with enhanced caching and exponential backoff
export async function getSheetValues(spreadsheetId: string, range: string): Promise<SheetValues> {
  clearExpiredEntries(); // Clean up expired entries
  
  const cacheKey = `${spreadsheetId}:${range}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  // Return cached data if still valid
  if (cached && (now - cached.timestamp) < cached.ttl) {
    cacheHits++;
    logCacheStats();
    return cached.data;
  }
  
  cacheMisses++;

  // Check if we need to evict entries due to size limit
  if (cache.size >= CACHE_SIZE_LIMIT) {
    // Find the oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    // Evict the oldest entry
    if (oldestKey) {
      cache.delete(oldestKey);
      cacheEvictions++;
    }
  }

  let lastError: GoogleSheetsError = new Error('No error occurred yet');
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (!auth) {
        console.log('Auth not initialized, attempting to initialize...');
        await getGoogleAuth();
        if (!auth) {
          throw new Error('Failed to initialize Google Sheets authentication');
        }
      }

      console.log(`Making request to Google Sheets API (attempt ${attempt + 1}):`, { spreadsheetId, range });
      const sheets = google.sheets({ 
        version: 'v4', 
        auth: auth as OAuth2Client
      });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      // Determine the appropriate TTL for this data
      const ttl = getTTLForSheet(range);

      // Cache the successful response
      cache.set(cacheKey, {
        data: response.data,
        timestamp: now,
        ttl
      });

      logCacheStats();
      return response.data;
    } catch (error) {
      lastError = error as GoogleSheetsError;
      if (lastError.code === 429) { // Rate limit error
        const delay = BASE_DELAY * Math.pow(2, attempt);
        console.log(`Rate limit hit, waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // For other errors, throw immediately
      }
    }
  }

  console.error('Error getting sheet values after retries:', lastError);
  throw lastError;
}

// Append values to a sheet
export async function appendSheetValues(
  spreadsheetId: string,
  range: string,
  valueInputOption: string,
  values: any[][]
): Promise<AppendResponse> {
  try {
    if (!auth) {
      await getGoogleAuth();
      if (!auth) {
        throw new Error('Failed to initialize Google Sheets authentication');
      }
    }
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: auth as OAuth2Client 
    });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: {
        values,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error appending sheet values:', error);
    throw error;
  }
}

// Update values in a sheet
export async function updateSheetValues(
  spreadsheetId: string,
  range: string,
  valueInputOption: string,
  values: any[][]
): Promise<UpdateResponse> {
  try {
    if (!auth) {
      await getGoogleAuth();
      if (!auth) {
        throw new Error('Failed to initialize Google Sheets authentication');
      }
    }
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: auth as OAuth2Client 
    });
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: {
        values,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error updating sheet values:', error);
    throw error;
  }
}

// Batch update
export async function batchUpdate(
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[]
): Promise<BatchUpdateResponse> {
  try {
    if (!auth) {
      await getGoogleAuth();
      if (!auth) {
        throw new Error('Failed to initialize Google Sheets authentication');
      }
    }
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: auth as OAuth2Client 
    });
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error batch updating sheet:', error);
    throw error;
  }
} 