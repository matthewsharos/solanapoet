import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

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

const router = Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

interface DisplayName {
  wallet_address: string;
  display_name: string;
}

// Helper function to get all display names
const getAllDisplayNames = async (sheets: any): Promise<DisplayName[]> => {
  console.log('Fetching all display names from Google Sheets...');
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
    range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`,
  });

  console.log('Raw sheet data:', response.data.values);
  
  const data = response.data.values || [];
  // Skip header row and convert to DisplayName objects
  const displayNames = data.slice(1).map((row: string[]) => {
    const entry = {
      wallet_address: (row[0] || '').trim(),
      display_name: (row[1] || '').trim()
    };
    console.log('Processing row:', { original: row, processed: entry });
    return entry;
  }).filter((entry: DisplayName) => {
    const isValid = entry.wallet_address && entry.display_name;
    if (!isValid) {
      console.log('Filtering out invalid entry:', entry);
    }
    return isValid;
  });

  console.log('Processed display names:', displayNames);
  return displayNames;
};

// Update display name in Google Sheets
router.post('/update', async (req: Request, res: Response): Promise<void> => {
  try {
    const { walletAddress, displayName } = req.body as UpdateDisplayNameRequest;

    if (!walletAddress || !displayName) {
      res.status(400).json({
        success: false,
        error: 'Wallet address and display name are required'
      });
      return;
    }

    // Initialize Google Sheets with credentials from environment variable
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get current display names
    const currentNames = await getAllDisplayNames(sheets);
    console.log('Current display names:', currentNames);

    // Check if wallet already has a display name (case-sensitive comparison)
    const existingEntry = currentNames.find(entry => entry.wallet_address === walletAddress);
    console.log('Existing entry:', existingEntry);

    if (!existingEntry) {
      // Wallet not found, append new row
      console.log('Adding new display name mapping:', { walletAddress, displayName });
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]]
        }
      });
    } else {
      // Find the actual row index (add 2 to account for 0-based index and header row)
      const rowIndex = currentNames.indexOf(existingEntry) + 2;
      
      // Update existing row
      console.log('Updating existing display name mapping:', { 
        walletAddress, 
        displayName,
        rowIndex 
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A${rowIndex}:B${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]]
        }
      });
    }

    // Get updated display names
    const updatedNames = await getAllDisplayNames(sheets);
    console.log('Updated display names:', updatedNames);

    res.json({
      success: true,
      message: 'Display name updated successfully',
      data: updatedNames
    });
    return;
  } catch (error) {
    console.error('Error updating display name:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    return;
  }
});

// Add a new endpoint to force refresh display names
router.post('/refresh', async (_req: Request, res: Response): Promise<void> => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as OAuth2Client });
    
    const displayNames = await getAllDisplayNames(sheets);
    console.log('Refreshed display names:', displayNames);

    res.json({
      success: true,
      message: 'Display names refreshed successfully',
      data: displayNames
    });
  } catch (error) {
    console.error('Error refreshing display names:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Add a debug endpoint to get raw display names data
router.get('/debug', async (_req: Request, res: Response): Promise<void> => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as OAuth2Client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`,
    });

    const data = response.data.values || [];
    console.log('Raw display names data from Google Sheets:', JSON.stringify(data, null, 2));

    res.json({
      success: true,
      message: 'Raw display names data fetched successfully',
      data: data
    });
  } catch (error) {
    console.error('Error fetching raw display names:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Add GET endpoint to fetch all display names
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('GET /display_names endpoint called');
    
    console.log('Google Sheets Config:', {
      hasSpreadsheetId: GOOGLE_SHEETS_CONFIG.hasSpreadsheetId,
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      hasGoogleCredentials: GOOGLE_SHEETS_CONFIG.hasGoogleCredentials,
    });

    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid Google credentials format: missing required fields');
      }
    } catch (parseError) {
      console.error('Failed to parse Google credentials:', parseError);
      res.status(500).json({
        success: false,
        error: 'Invalid Google credentials configuration'
      });
      return;
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    console.log('Google Auth initialized');

    const client = await auth.getClient();
    console.log('Google Auth client obtained');
    
    const sheets = google.sheets({ version: 'v4', auth: client as OAuth2Client });
    console.log('Google Sheets client initialized');
    
    const displayNames = await getAllDisplayNames(sheets);
    console.log('Fetched display names:', displayNames);

    res.json({
      success: true,
      message: 'Display names fetched successfully',
      data: displayNames
    });
  } catch (error) {
    console.error('Error fetching display names:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      googleConfig: {
        hasSpreadsheetId: GOOGLE_SHEETS_CONFIG.hasSpreadsheetId,
        hasGoogleCredentials: GOOGLE_SHEETS_CONFIG.hasGoogleCredentials,
      }
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router; 