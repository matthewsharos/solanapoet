import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for display names...');
    
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Missing Google API credentials');
    }
    
    // Ensure private key is properly formatted
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[serverless] Google Auth client initialized for display names');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Helper function to find a wallet address in the display names sheet
async function findWalletAddressRow(sheets, walletAddress) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const range = 'display_names!A:B'; // Columns for wallet address and display name
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values || [];
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === walletAddress) {
        return i + 1; // Return 1-indexed row number
      }
    }
    
    return -1; // Not found
  } catch (error) {
    console.error('Error finding wallet address:', error);
    throw error;
  }
}

// Serverless function for display names API
export default async function handler(req, res) {
  console.log('[serverless] Display names endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Fetch display names
  if (req.method === 'GET') {
    try {
      console.log('Fetching display names directly from Google Sheets');
      
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
      }
      
      // Get data from the display_names sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:B', // Columns for wallet address and display name
      });
      
      const rows = response.data.values || [];
      
      // Skip header row
      const displayNames = rows.slice(1).map(row => ({
        walletAddress: row[0] || '',
        displayName: row[1] || ''
      })).filter(entry => entry.walletAddress);
      
      return res.status(200).json({
        success: true,
        displayNames: displayNames
      });
    } catch (error) {
      console.error('Error fetching display names:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Error fetching display names',
        message: error.message
      });
    }
  }
  
  // POST: Update display name
  if (req.method === 'POST') {
    try {
      const { walletAddress, displayName } = req.body;
      
      if (!walletAddress || !displayName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Wallet address and display name are required'
        });
      }
      
      console.log(`Updating display name for ${walletAddress} to "${displayName}"`);
      
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      // Find the row for the wallet address
      const rowIndex = await findWalletAddressRow(sheets, walletAddress);
      
      if (rowIndex === -1) {
        // Wallet address not found, append a new row
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'display_names!A:B',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[walletAddress, displayName]]
          }
        });
        
        console.log(`Added new display name for ${walletAddress}`);
      } else {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `display_names!B${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[displayName]]
          }
        });
        
        console.log(`Updated display name for ${walletAddress} at row ${rowIndex}`);
      }
      
      return res.status(200).json({ 
        success: true, 
        message: 'Display name updated successfully'
      });
    } catch (error) {
      console.error('Error updating display name:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Error updating display name',
        message: error.message
      });
    }
  }
  
  return res.status(405).json({ success: false, error: 'Method not allowed' });
} 