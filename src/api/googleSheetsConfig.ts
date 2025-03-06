import { sheets_v4 } from '@googleapis/sheets';
import { google } from 'googleapis';
import { API_BASE_URL } from './config';

// Frontend Google Sheets configuration
export const GOOGLE_SHEETS_CONFIG = {
  hasSpreadsheetId: false,
  hasGoogleCredentials: false,
  spreadsheetId: '',
  credentialsPath: '',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  sheets: {
    collections: 'collections',
    ultimates: 'ultimates',
    displayNames: 'display_names',
    artRequests: 'art_requests'
  },
};

// Initialize config from API
fetch('/api/config')
  .then(response => response.json())
  .then(config => {
    GOOGLE_SHEETS_CONFIG.spreadsheetId = config.GOOGLE_SHEETS_SPREADSHEET_ID;
    GOOGLE_SHEETS_CONFIG.hasSpreadsheetId = !!config.GOOGLE_SHEETS_SPREADSHEET_ID;
  })
  .catch(error => {
    console.error('Failed to load config:', error);
  });

// Log environment variables for debugging
console.log('Google Sheets Config:', {
  spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
  sheets: GOOGLE_SHEETS_CONFIG.sheets,
  hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
  hasSpreadsheetId: !!process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID
});

// Response type for Google Sheets API
export interface SheetResponse {
  success: boolean;
  data: any[];
  error?: string;
  retryAfter?: number;
}

// Define a type for the sheets client
export interface SheetsClient {
  spreadsheets: {
    values: {
      get: (params: {
        spreadsheetId: string;
        range: string;
      }) => Promise<{
        data: {
          values: any[][];
        };
      }>;
      append: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: {
          values: any[][];
        };
      }) => Promise<any>;
      update: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: {
          values: any[][];
        };
      }) => Promise<any>;
    };
    batchUpdate: (params: {
      spreadsheetId: string;
      requestBody: any;
    }) => Promise<any>;
  };
}

let sheetsClient: SheetsClient | null = null;

export const createSheetsClient = async (): Promise<SheetsClient> => {
  if (!sheetsClient) {
    sheetsClient = {
      spreadsheets: {
        values: {
          get: async ({ spreadsheetId, range }) => {
            const sheetName = range.split('!')[0];
            const response = await fetch(`${API_BASE_URL}/api/sheets/${sheetName}`);
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || 'Failed to fetch sheet data');
            }

            return { data: { values: result.data } };
          },
          append: async ({ spreadsheetId, range, valueInputOption, requestBody }) => {
            const response = await fetch(`${API_BASE_URL}/api/sheets/${range.split('!')[0]}/append`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response.json();
          },
          update: async ({ spreadsheetId, range, valueInputOption, requestBody }) => {
            const response = await fetch(`${API_BASE_URL}/api/sheets/${range.split('!')[0]}/update`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                range: range.split('!')[1],
                values: requestBody.values,
              }),
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response.json();
          },
        },
        batchUpdate: async ({ spreadsheetId, requestBody }) => {
          const response = await fetch(`${API_BASE_URL}/api/sheets/batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          return response.json();
        },
      },
    };
  }
  return sheetsClient;
};

// Export sheets client
export let sheets: SheetsClient | null = null;

// Initialize sheets client
(async () => {
  try {
    sheets = await createSheetsClient();
    console.log('Google Sheets client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Google Sheets client:', error);
  }
})();

// Helper function to format sheet name for API request
const getSheetRange = (sheetName: string) => {
  return `${sheetName}!A1:Z1004`;
};

/**
 * Get data from Google Sheets with rate limit handling
 */
export const get = async (sheetName: string): Promise<SheetResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sheets/${sheetName}`);
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      console.log(`Rate limited, retry after ${retryAfter} seconds`);
      return {
        success: false,
        data: [],
        error: 'Rate limit exceeded',
        retryAfter
      };
    }

    if (!response.ok) {
      return {
        success: false,
        data: [],
        error: `HTTP error! status: ${response.status}`
      };
    }

    const result = await response.json();
    if (!result.success) {
      return {
        success: false,
        data: [],
        error: result.error || 'Failed to fetch sheet data'
      };
    }

    return {
      success: true,
      data: result.data || []
    };
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Test function to verify Google Sheets API access
export const testGoogleSheetsConnection = async () => {
  try {
    const collections = await get(GOOGLE_SHEETS_CONFIG.sheets.collections);
    console.log('Test connection successful:', collections);
    return collections.success;
  } catch (error) {
    console.error('Test connection failed:', error);
    return false;
  }
}; 