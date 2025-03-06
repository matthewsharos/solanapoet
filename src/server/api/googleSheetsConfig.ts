import { sheets_v4 } from '@googleapis/sheets';
import { google } from 'googleapis';
import { GaxiosPromise } from 'gaxios';
import { OAuth2Client } from 'google-auth-library';

// Log environment variables for debugging
console.log('Initializing Google Sheets Config:', {
  hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
  environment: process.env.NODE_ENV
});

// Configuration
export const GOOGLE_SHEETS_CONFIG = {
  hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
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
export const createSheetsClient = async () => {
  try {
    // First try using direct client email and private key env variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Creating sheets client using GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
      
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
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const client = await auth.getClient();
      return google.sheets({ version: 'v4', auth: client as OAuth2Client });
    }
    
    throw new Error('Google credentials not found. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
  } catch (error) {
    console.error('Error creating sheets client:', error);
    throw error;
  }
}; 