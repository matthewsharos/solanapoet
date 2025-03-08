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
      // Use full access for updating sheets
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

// Serverless function for handling display name operations (GET/PUT)
export default async function handler(req, res) {
  console.log('[serverless] Display names [address] endpoint called with method:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('[serverless] Handling OPTIONS request');
    return res.status(200).end();
  }

  // Get the address parameter from the URL
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ 
      success: false, 
      message: 'Address parameter is required' 
    });
  }
  
  // GET request handler (fetch display name for address)
  if (req.method === 'GET') {
    try {
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        console.warn('[serverless] Missing spreadsheet ID');
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      }
      
      // Get data from the display_names sheet
      console.log(`[serverless] Fetching display name for address: ${address}`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:C',
      });
      
      const rows = response.data.values || [];
      
      // Skip header row and find the matching address
      const match = rows.slice(1).find(row => row[0] === address);
      
      if (match && match[1]) {
        console.log(`[serverless] Found display name for address ${address}: ${match[1]}`);
        return res.status(200).json({
          success: true,
          displayName: match[1]
        });
      } else {
        console.log(`[serverless] No display name found for address ${address}`);
        return res.status(200).json({
          success: true,
          displayName: null
        });
      }
      
    } catch (error) {
      console.error('[serverless] Error fetching display name:', error);
      return res.status(200).json({
        success: true,
        displayName: null
      });
    }
  }
  
  // PUT request handler (update display name for address)
  if (req.method === 'PUT') {
    try {
      // Check payload
      const { displayName } = req.body;
      
      if (!displayName) {
        return res.status(400).json({ 
          success: false, 
          message: 'displayName is required in the request body' 
        });
      }
      
      console.log(`[serverless] Updating display name for ${address} to: ${displayName}`);
      
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
      const rowIndex = rows.findIndex(row => row[0] === address);
      
      const timestamp = new Date().toISOString();
      
      // If address not found, append a new row
      if (rowIndex === -1) {
        console.log(`[serverless] Adding new display name for ${address}`);
        
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'display_names!A:C',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[address, displayName, timestamp]]
          }
        });
      } 
      // If address found, update the existing row
      else {
        console.log(`[serverless] Updating existing display name for ${address} at row ${rowIndex + 1}`);
        
        // +1 because sheets are 1-indexed and header row counts
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `display_names!A${rowIndex + 1}:C${rowIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[address, displayName, timestamp]]
          }
        });
      }
      
      console.log(`[serverless] Successfully updated display name for ${address}`);
      
      return res.status(200).json({
        success: true,
        message: 'Display name updated successfully',
        displayName: displayName
      });
      
    } catch (error) {
      console.error('[serverless] Error updating display name:', error);
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
    message: `Method ${req.method} not allowed. Use GET or PUT instead.` 
  });
} 