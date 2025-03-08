import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[API] Initializing Google Sheets client...');
    
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
      // Use full access for updating sheets
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[API] Google Auth client initialized');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[API] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Next.js API route handler
export default async function handler(req, res) {
  console.log('[API] Display names endpoint called with method:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('[API] Handling OPTIONS request');
    return res.status(200).end();
  }

  // Handle GET request - Fetch all display names
  if (req.method === 'GET') {
    try {
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        console.warn('[API] Missing spreadsheet ID');
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      }
      
      // Get data from the display_names sheet
      console.log('[API] Fetching data from display_names sheet...');
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:C',
      });
      
      const rows = response.data.values || [];
      
      // Skip header row and process the data
      const displayNames = rows.slice(1).map(row => ({
        walletAddress: row[0] || '',
        displayName: row[1] || '',
        updated_at: row[2] || new Date().toISOString()
      })).filter(entry => entry.walletAddress && entry.displayName);
      
      console.log(`[API] Found ${displayNames.length} display names`);
      
      // Return all display names
      return res.status(200).json({
        success: true,
        displayNames: displayNames
      });
    } catch (error) {
      console.error('[API] Error fetching display names:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching display names',
        error: error.message
      });
    }
  }

  // Handle POST request - Update display name
  if (req.method === 'POST') {
    try {
      // Log entire request for debugging
      console.log('[API] POST request headers:', req.headers);
      console.log('[API] POST request body:', req.body);
      
      const { walletAddress, displayName } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'walletAddress is required in the request body'
        });
      }
      
      if (!displayName) {
        return res.status(400).json({
          success: false,
          message: 'displayName is required in the request body'
        });
      }
      
      console.log(`[API] Updating display name for ${walletAddress} to: ${displayName}`);
      
      // Initialize sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      }
      
      // First, check if the address already has a display name
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:C',
      });
      
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === walletAddress);
      
      const timestamp = new Date().toISOString();
      
      // If address not found, append a new row
      if (rowIndex === -1) {
        console.log(`[API] Adding new display name for ${walletAddress}`);
        
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'display_names!A:C',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[walletAddress, displayName, timestamp]]
          }
        });
      } 
      // If address found, update the existing row
      else {
        console.log(`[API] Updating existing display name for ${walletAddress} at row ${rowIndex + 1}`);
        
        // +1 because sheets are 1-indexed and header row counts
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `display_names!A${rowIndex + 1}:C${rowIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[walletAddress, displayName, timestamp]]
          }
        });
      }
      
      console.log(`[API] Successfully updated display name for ${walletAddress}`);
      
      return res.status(200).json({
        success: true,
        message: 'Display name updated successfully',
        displayName: displayName
      });
    } catch (error) {
      console.error('[API] Error updating display name:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating display name',
        error: error.message
      });
    }
  }

  // Handle unsupported methods
  return res.status(405).json({
    success: false,
    message: `Method ${req.method} not allowed. Use GET, POST, or OPTIONS.`
  });
} 