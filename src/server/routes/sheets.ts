import express, { Request, Response, RequestHandler } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_SHEETS_CONFIG } from '../api/googleSheetsConfig';
import * as fs from 'fs';
import * as path from 'path';
import { sheets_v4 } from '@googleapis/sheets';

const router = express.Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

// Helper function to get Google Sheets auth
export const getGoogleAuth = async (): Promise<OAuth2Client> => {
  try {
    let credentials;
    
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
      throw new Error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
    }

    try {
      console.log('Parsing Google credentials from environment variable...');
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      console.log('Credentials parsed successfully:', {
        type: credentials.type,
        project_id: credentials.project_id,
        client_email: credentials.client_email
      });
    } catch (parseError) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', parseError);
      throw new Error('Invalid GOOGLE_CREDENTIALS_JSON format');
    }
    
    if (!credentials.client_email || !credentials.private_key) {
      console.error('Missing required credential fields:', {
        hasClientEmail: !!credentials.client_email,
        hasPrivateKey: !!credentials.private_key
      });
      throw new Error('Invalid credentials: missing client_email or private_key');
    }
    
    console.log('Creating Google auth client...');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
    });
    
    console.log('Getting auth client...');
    const client = await auth.getClient() as OAuth2Client;
    console.log('Google auth client created successfully');
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
      spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
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
      spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === walletAddress);

    if (rowIndex === -1) {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: GOOGLE_SHEETS_CONFIG.sheets.displayNames,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]],
        },
      });
    } else {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId,
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
    console.log('Fetching sheet data for:', sheetName, {
      hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
      spreadsheetId: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID,
      environment: process.env.NODE_ENV,
      configSheets: GOOGLE_SHEETS_CONFIG.sheets
    });
    
    if (!GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets]) {
      console.error('Invalid sheet name requested:', sheetName);
      res.status(400).json({
        success: false,
        error: 'Invalid sheet name'
      });
      return;
    }

    // Initialize Google auth
    console.log('Getting Google auth...');
    const auth = await getGoogleAuth();
    console.log('Creating sheets client...');
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || GOOGLE_SHEETS_CONFIG.spreadsheetId;
    console.log('Using spreadsheet ID:', spreadsheetId);

    // Get sheet data
    console.log('Fetching data from sheet...', {
      spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets]
    });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.sheets[sheetName as keyof typeof GOOGLE_SHEETS_CONFIG.sheets],
    });

    console.log('Data fetched successfully:', {
      rowCount: response.data.values?.length || 0,
      hasValues: !!response.data.values
    });

    res.json({
      success: true,
      data: response.data.values || []
    });
  } catch (error) {
    console.error('Error in getSheetDataHandler:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Error ? error.constructor.name : typeof error
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sheet data',
      details: error instanceof Error ? error.stack : undefined
    });
  }
};

router.get('/display_names', getDisplayNamesHandler);
router.post('/display_names/update', updateDisplayNameHandler);
router.get('/:sheetName', getSheetDataHandler);

export default router; 