import express, { Request, Response, RequestHandler } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { sheets_v4 } from '@googleapis/sheets';

// Google Sheets configuration
const GOOGLE_SHEETS_CONFIG = {
  hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
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

const router = express.Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

// Helper function to get Google Sheets auth
const getGoogleAuth = async (): Promise<OAuth2Client> => {
  try {
    console.log('Starting Google auth initialization...');
    
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      console.error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
      throw new Error('Google credentials not configured');
    }

    console.log('Attempting to parse Google credentials...');
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      
      // Fix private key format if needed
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
      
      console.log('Successfully parsed Google credentials with fields:', Object.keys(credentials));
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', {
        error: parseError,
        credentialsLength: process.env.GOOGLE_CREDENTIALS_JSON.length,
        credentialsStart: process.env.GOOGLE_CREDENTIALS_JSON.substring(0, 50) + '...'
      });
      throw new Error('Invalid Google credentials format: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
    }

    if (!credentials.client_email || !credentials.private_key) {
      console.error('Missing required fields in Google credentials:', {
        hasClientEmail: !!credentials.client_email,
        hasPrivateKey: !!credentials.private_key,
        availableFields: Object.keys(credentials)
      });
      throw new Error('Invalid Google credentials structure: missing required fields');
    }

    console.log('Initializing Google Sheets auth with client email:', credentials.client_email);
    
    // Create auth client with proper credentials
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Created GoogleAuth instance, attempting to get client...');
    const client = await auth.getClient() as OAuth2Client;
    console.log('Successfully created Google auth client');
    return client;
  } catch (error) {
    console.error('Error in getGoogleAuth:', error);
    throw error;
  }
};

// Get display names
const getDisplayNamesHandler: RequestHandler = async (req, res) => {
  try {
    // Initialize Google auth
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get display names
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
    });

    res.json({
      success: true,
      data: response.data.values || []
    });
  } catch (error) {
    console.error('Error fetching display names:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch display names'
    });
  }
};

// Update display name in Google Sheets
const updateDisplayNameHandler: RequestHandler = async (req, res) => {
  try {
    const { walletAddress, displayName } = req.body as UpdateDisplayNameRequest;

    if (!walletAddress || !displayName) {
      res.status(400).json({
        success: false,
        error: 'Wallet address and display name are required'
      });
      return;
    }

    // Initialize Google auth
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get existing display names
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === walletAddress);

    if (rowIndex === -1) {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]],
        },
      });
    } else {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A${rowIndex + 1}:B${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]],
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating display name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update display name'
    });
  }
};

// Get sheet data
const getSheetDataHandler: RequestHandler = async (req, res) => {
  try {
    const sheetName = req.params.sheetName;
    console.log('Fetching sheet data for:', sheetName);

    // Validate environment variables
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      console.error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      return res.status(500).json({
        success: false,
        error: 'Google Sheets configuration missing'
      });
    }

    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      console.error('GOOGLE_CREDENTIALS_JSON not configured');
      return res.status(500).json({
        success: false,
        error: 'Google credentials not configured'
      });
    }

    if (!GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets]) {
      console.error('Invalid sheet name requested:', sheetName);
      return res.status(400).json({
        success: false,
        error: 'Invalid sheet name'
      });
    }

    console.log('Environment validation passed, initializing Google auth...');

    // Initialize Google auth
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get sheet data
    const range = GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets];
    console.log('Fetching data from sheet:', {
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range,
      sheetName
    });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range,
    });

    console.log('Data fetched successfully:', {
      sheetName,
      rowCount: response.data.values?.length || 0,
      hasData: !!response.data.values
    });

    return res.json({
      success: true,
      data: response.data.values || []
    });
  } catch (error) {
    console.error('Error in getSheetDataHandler:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Determine if this is an auth error
    const isAuthError = error instanceof Error && 
      (error.message.includes('credentials') || error.message.includes('auth'));
    
    return res.status(500).json({
      success: false,
      error: isAuthError ? 'Google authentication failed' : 'Failed to fetch sheet data',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Add diagnostic endpoint
router.get('/test-config', async (req, res) => {
  try {
    // First, just log the raw environment variables
    console.log('Raw environment variables:', {
      hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
      credentialsLength: process.env.GOOGLE_CREDENTIALS_JSON?.length || 0,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    });

    const results = {
      envVarsPresent: {
        GOOGLE_CREDENTIALS_JSON: !!process.env.GOOGLE_CREDENTIALS_JSON,
        GOOGLE_SHEETS_SPREADSHEET_ID: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID
      },
      credentialsValid: false,
      authClientCreated: false,
      sheetsApiConnected: false,
      canReadSpreadsheet: false,
      error: null as string | null,
      diagnostics: {
        spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 'not set',
        credentialsLength: process.env.GOOGLE_CREDENTIALS_JSON?.length || 0,
        credentialsFirstChar: process.env.GOOGLE_CREDENTIALS_JSON ? 
          process.env.GOOGLE_CREDENTIALS_JSON[0] : 'not set',
        credentialsLastChar: process.env.GOOGLE_CREDENTIALS_JSON ? 
          process.env.GOOGLE_CREDENTIALS_JSON[process.env.GOOGLE_CREDENTIALS_JSON.length - 1] : 'not set',
        parseError: null as string | null
      }
    };

    // Attempt to parse credentials if present
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        results.credentialsValid = !!(credentials.client_email && credentials.private_key);
        results.diagnostics.parseError = null;
      } catch (parseError) {
        results.diagnostics.parseError = parseError instanceof Error ? 
          `JSON Parse Error: ${parseError.message}` : 'Unknown parse error';
        results.error = `Failed to parse credentials: ${results.diagnostics.parseError}`;
      }
    } else {
      results.error = 'GOOGLE_CREDENTIALS_JSON is not set';
    }

    // Always return a response
    return res.json(results);
  } catch (error) {
    // If anything goes wrong, return error info
    return res.json({
      error: 'Diagnostic endpoint error',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

router.get('/display_names', getDisplayNamesHandler);
router.post('/display_names/update', updateDisplayNameHandler);
router.get('/:sheetName', getSheetDataHandler);

export { getGoogleAuth };
export default router; 