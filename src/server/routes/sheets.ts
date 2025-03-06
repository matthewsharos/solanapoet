import express, { Request, Response, RequestHandler } from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_SHEETS_CONFIG } from '../../api/googleSheetsConfig';

const router = express.Router();

interface UpdateDisplayNameRequest {
  walletAddress: string;
  displayName: string;
}

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
    const auth = await new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    }).getClient() as OAuth2Client;

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

router.post('/display_names/update', updateDisplayNameHandler);

export default router; 