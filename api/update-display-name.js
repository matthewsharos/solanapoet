import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client...');
    
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

    console.log('[serverless] Google Auth client initialized');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Serverless function for updating display names
export default async function handler(req, res) {
  console.log('[serverless] Simple update-display-name endpoint called with method:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('[serverless] Handling OPTIONS request');
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    console.log('[serverless] Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST instead.'
    });
  }

  // Log request body for debugging
  console.log('[serverless] Request body:', req.body);

  try {
    const { walletAddress, displayName } = req.body;
    console.log('[serverless] Extracted walletAddress:', walletAddress);
    console.log('[serverless] Extracted displayName:', displayName);
    
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
    
    console.log(`[serverless] Updating display name for ${walletAddress} to: ${displayName}`);
    
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
      console.log(`[serverless] Adding new display name for ${walletAddress}`);
      
      const appendResponse = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'display_names!A:C',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName, timestamp]]
        }
      });
      
      console.log('[serverless] Append response:', appendResponse.data);
    } 
    // If address found, update the existing row
    else {
      console.log(`[serverless] Updating existing display name for ${walletAddress} at row ${rowIndex + 1}`);
      
      // +1 because sheets are 1-indexed and header row counts
      const updateResponse = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `display_names!A${rowIndex + 1}:C${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName, timestamp]]
        }
      });
      
      console.log('[serverless] Update response:', updateResponse.data);
    }
    
    console.log(`[serverless] Successfully updated display name for ${walletAddress}`);
    
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