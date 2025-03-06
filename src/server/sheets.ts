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

async function initializeAuth() {
  try {
    // First try using direct credentials from env
    if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.log('Initializing auth using credentials from GOOGLE_SHEETS_CREDENTIALS');
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
      auth = await new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      }).getClient() as OAuth2Client;
      console.log('Successfully initialized Google Sheets auth');
      return;
    }
    
    // Then try using credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Initializing auth using credentials file from GOOGLE_APPLICATION_CREDENTIALS');
      auth = await new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      }).getClient() as OAuth2Client;
      console.log('Successfully initialized Google Sheets auth');
      return;
    }

    throw new Error('Neither GOOGLE_SHEETS_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS environment variable is set');
  } catch (error) {
    console.error('Failed to initialize Google Sheets auth:', error);
    auth = null;
    throw new Error('Google Sheets authentication failed. Please check your credentials.');
  }
}

// Initialize auth when the module loads
initializeAuth().catch(console.error);

// Cache configuration
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache TTL
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

interface GoogleSheetsError extends Error {
  code?: number;
}

// Get values from a sheet with caching and exponential backoff
export async function getSheetValues(spreadsheetId: string, range: string): Promise<SheetValues> {
  const cacheKey = `${spreadsheetId}:${range}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  // Return cached data if still valid
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  let lastError: GoogleSheetsError = new Error('No error occurred yet');
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (!auth) {
        console.log('Auth not initialized, attempting to initialize...');
        await initializeAuth();
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

      // Cache the successful response
      cache.set(cacheKey, {
        data: response.data,
        timestamp: now
      });

      console.log('Successfully retrieved sheet data');
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
      await initializeAuth();
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
      await initializeAuth();
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
      await initializeAuth();
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