import { sheets_v4 } from '@googleapis/sheets';
import { google } from 'googleapis';

// Log environment variables for debugging
console.log('Initializing Google Sheets Config:', {
  hasSpreadsheetId: !!process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID,
  hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
  environment: process.env.NODE_ENV
});

// Configuration
export const GOOGLE_SHEETS_CONFIG = {
  spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0', // Fallback to default ID
  sheets: {
    collections: 'collections',
    ultimates: 'ultimates',
    displayNames: 'display_names',
    artRequests: 'art_requests'
  }
};

// Log the final config
console.log('Google Sheets Config initialized:', {
  spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
  sheets: GOOGLE_SHEETS_CONFIG.sheets
});

// Types
export interface SheetResponse {
  success: boolean;
  data: any[];
  error?: string;
  retryAfter?: number;
}

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

// Create sheets client
export const createSheetsClient = async (): Promise<SheetsClient> => {
  try {
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      throw new Error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
    }

    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
  } catch (error) {
    console.error('Error creating sheets client:', error);
    throw error;
  }
}; 