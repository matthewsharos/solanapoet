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
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0', // Default to the provided spreadsheet ID
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

// Validate configuration on startup
(() => {
  if (!GOOGLE_SHEETS_CONFIG.hasSpreadsheetId) {
    console.warn('GOOGLE_SHEETS_SPREADSHEET_ID not set, using default');
  }
  if (!GOOGLE_SHEETS_CONFIG.hasGoogleCredentials) {
    console.error('GOOGLE_CREDENTIALS_JSON not set');
  }
})();

const router = express.Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

// Helper function to get Google Sheets auth
const getGoogleAuth = async (): Promise<OAuth2Client> => {
  try {
    console.log('Starting Google auth initialization...');
    
    // Try using direct client email and private key env variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Using separate GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
      console.log('Initializing Google Sheets auth with client email:', process.env.GOOGLE_CLIENT_EMAIL);
      
      // Process private key to handle possible missing actual newlines
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
        console.log('Converting escaped newlines in private key to actual newlines');
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      // Create auth client with individual credentials
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      console.log('Created GoogleAuth instance, attempting to get client...');
      return await auth.getClient() as OAuth2Client;
    }
    
    // Fall back to JSON credentials
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      console.error('Neither GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY nor GOOGLE_CREDENTIALS_JSON environment variables are set');
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

// Add test endpoint to verify configuration
router.get('/test', async (req: Request, res: Response) => {
  try {
    // Test environment variables
    const envStatus = {
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      hasCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
      credentialsLength: process.env.GOOGLE_CREDENTIALS_JSON?.length || 0
    };

    console.log('Testing Google Sheets configuration:', envStatus);

    // Test auth
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Test API access
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: 'A1:A1'
    });

    res.json({
      success: true,
      envStatus,
      apiTest: {
        success: true,
        response: response.data
      }
    });
  } catch (error) {
    console.error('Error testing Google Sheets configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      envStatus: {
        hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        hasCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON
      }
    });
  }
});

// Add a test endpoint to verify Google Sheets connection
router.get('/test-connection', async (req, res) => {
  try {
    console.log('Testing Google Sheets connection...');
    
    // Log environment variables (excluding sensitive parts)
    console.log('Environment variables check:', {
      GOOGLE_CLIENT_EMAIL_exists: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_CLIENT_EMAIL_length: process.env.GOOGLE_CLIENT_EMAIL?.length,
      GOOGLE_PRIVATE_KEY_exists: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_length: process.env.GOOGLE_PRIVATE_KEY?.length,
      GOOGLE_PRIVATE_KEY_starts: process.env.GOOGLE_PRIVATE_KEY?.substring(0, 27),
      GOOGLE_PRIVATE_KEY_has_newlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\\n'),
      GOOGLE_SHEETS_SPREADSHEET_ID_exists: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    });
    
    // Process private key to handle possible missing actual newlines
    if (process.env.GOOGLE_PRIVATE_KEY && !process.env.GOOGLE_PRIVATE_KEY.includes('\n') && process.env.GOOGLE_PRIVATE_KEY.includes('\\n')) {
      console.log('Converting escaped newlines in private key to actual newlines');
      process.env.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    
    // Get auth client
    const authClient = await getGoogleAuth();
    console.log('Successfully got auth client');
    
    // Create sheets client
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Get spreadsheet info to verify connection
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId;
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });
    
    // Return success with spreadsheet info
    return res.status(200).json({
      success: true,
      message: 'Google Sheets connection successful',
      spreadsheetTitle: response.data.properties?.title,
      // Include information about authentication method used
      authMethod: process.env.GOOGLE_CLIENT_EMAIL ? 'Direct credentials' : 'JSON credentials',
      sheets: response.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean)
    });
  } catch (error: any) {
    console.error('Google Sheets test connection failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Google Sheets connection failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add a debug endpoint to check environment variables
router.get('/debug-env', async (req, res) => {
  try {
    console.log('Debugging environment variables...');
    
    const envInfo = {
      GOOGLE_CLIENT_EMAIL_exists: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_CLIENT_EMAIL_length: process.env.GOOGLE_CLIENT_EMAIL?.length,
      GOOGLE_PRIVATE_KEY_exists: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_length: process.env.GOOGLE_PRIVATE_KEY?.length,
      GOOGLE_PRIVATE_KEY_starts: process.env.GOOGLE_PRIVATE_KEY?.substring(0, 27),
      GOOGLE_PRIVATE_KEY_has_newlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\\n'),
      GOOGLE_PRIVATE_KEY_has_real_newlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\n'),
      GOOGLE_SHEETS_SPREADSHEET_ID_exists: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 'Not set',
      NODE_ENV: process.env.NODE_ENV || 'Not set'
    };
    
    return res.status(200).json({
      success: true,
      environment: envInfo
    });
  } catch (error: any) {
    console.error('Debug environment failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Debug environment failed',
      error: error.message
    });
  }
});

// Simple health check endpoint
router.get('/health', async (req, res) => {
  try {
    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Add error logging middleware
router.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Server error:', {
    error: err,
    message: err.message,
    stack: err.stack,
    path: req.path
  });
  res.status(500).json({
    error: 'Server error',
    message: err.message,
    path: req.path
  });
});

// Add basic logging middleware
router.use((req: Request, res: Response, next: any) => {
  console.log('Request received:', {
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body
  });
  next();
});

// Register routes
router.get('/display_names', getDisplayNamesHandler);
router.post('/display_names/update', updateDisplayNameHandler);
router.get('/:sheetName', getSheetDataHandler);

export { getGoogleAuth };
export default router; 