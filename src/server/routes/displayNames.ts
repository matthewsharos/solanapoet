import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Google Sheets configuration
const GOOGLE_SHEETS_CONFIG = {
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

// Add a function to get Google authentication
const getGoogleAuth = async () => {
  // Process private key to handle escaped newlines
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
    console.log('Converting escaped newlines in private key to actual newlines');
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: privateKey
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
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
    const auth = await getGoogleAuth();
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
    const auth = await getGoogleAuth();
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
    const auth = await getGoogleAuth();
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

    const auth = await getGoogleAuth();
    const client = await auth.getClient();
    console.log('Google Auth initialized');
    
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

// Add a batch endpoint to fetch multiple display names at once
router.get('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('GET /display_names/batch endpoint called');
    
    // Get addresses from query parameters (can be multiple)
    const addresses = Array.isArray(req.query.addresses) 
      ? req.query.addresses as string[] 
      : req.query.addresses 
        ? [req.query.addresses as string] 
        : [];
    
    if (!addresses.length) {
      console.log('No addresses provided for batch lookup');
      res.json({
        success: true,
        message: 'No addresses provided',
        displayNames: {}
      });
      return;
    }
    
    console.log(`Batch looking up ${addresses.length} addresses:`, addresses);
    
    const auth = await getGoogleAuth();
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as OAuth2Client });
    
    // Get all display names once (more efficient than multiple lookups)
    const allDisplayNames = await getAllDisplayNames(sheets);
    
    // Create a map for quick lookup
    const displayNamesMap: Record<string, string> = {};
    for (const address of addresses) {
      // Find the matching display name
      const normalizedAddress = address.toLowerCase();
      const entry = allDisplayNames.find(
        e => e.wallet_address.toLowerCase() === normalizedAddress
      );
      
      if (entry) {
        displayNamesMap[address] = entry.display_name;
      }
    }
    
    console.log(`Found ${Object.keys(displayNamesMap).length} display names for ${addresses.length} addresses`);
    
    res.json({
      success: true,
      message: 'Display names batch lookup completed',
      displayNames: displayNamesMap
    });
  } catch (error) {
    console.error('Error in batch display names lookup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router; 