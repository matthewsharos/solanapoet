import express, { Request, Response, RequestHandler } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_SHEETS_CONFIG } from '../../api/googleSheetsConfig';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

// Helper function to get Google Sheets auth
const getGoogleAuth = async (): Promise<OAuth2Client> => {
  try {
    let credentials;
    
    if (process.env.NODE_ENV === 'production') {
      // In production (Vercel), use environment variables
      if (!process.env.GOOGLE_CREDENTIALS_JSON) {
        throw new Error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
      }
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else {
      // In development, use the credentials file
      const credentialsPath = path.join(process.cwd(), 'credentials.json');
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    return auth.getClient() as Promise<OAuth2Client>;
  } catch (error) {
    console.error('Error loading Google credentials:', error);
    throw error;
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
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === walletAddress);

    if (rowIndex === -1) {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]],
        },
      });
    } else {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
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
    
    if (!GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets]) {
      res.status(400).json({
        success: false,
        error: 'Invalid sheet name'
      });
      return;
    }

    // Initialize Google auth
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets],
    });

    res.json({
      success: true,
      data: response.data.values || []
    });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sheet data'
    });
  }
};

router.post('/display_names/update', updateDisplayNameHandler);
router.get('/:sheetName', getSheetDataHandler);

export default router; 