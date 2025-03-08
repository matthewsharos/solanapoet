import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[API] Initializing Google Sheets client...');
    
    if (!process.env.GOOGLE_CLIENT_EMAIL) {
      console.error('[API] Missing GOOGLE_CLIENT_EMAIL environment variable');
      throw new Error('GOOGLE_CLIENT_EMAIL not configured');
    }
    
    if (!process.env.GOOGLE_PRIVATE_KEY) {
      console.error('[API] Missing GOOGLE_PRIVATE_KEY environment variable');
      throw new Error('GOOGLE_PRIVATE_KEY not configured');
    }
    
    console.log('[API] Google API credentials found');
    
    // Ensure private key is properly formatted
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    
    // Check if the key needs to be unescaped
    if (privateKey.includes('\\n')) {
      console.log('[API] Unescaping private key newlines');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // Verify the key has the proper PEM format
    if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      console.warn('[API] Private key does not start with expected format');
    }
    
    console.log('[API] Creating Google Auth client...');
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[API] Google Auth client created, initializing sheets client');
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Verify credentials by making a small test request
    try {
      // Just request the spreadsheet metadata to verify authentication
      if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        console.log('[API] Verifying sheets API access with test request...');
        const testResponse = await sheets.spreadsheets.get({
          spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
          fields: 'spreadsheetId,properties.title' // Minimal fields for fast response
        });
        console.log('[API] Test request successful:', testResponse.data.properties.title);
      }
    } catch (testError) {
      console.warn('[API] Test request failed, but proceeding anyway:', testError.message);
      // Still proceed with the client since the main request might work
    }
    
    return sheets;
  } catch (error) {
    console.error('[API] Error initializing Google Sheets client:', error);
    console.error('[API] Error stack:', error.stack);
    throw error;
  }
}

// Next.js API route handler
export default async function handler(req, res) {
  console.log('[API] Display names endpoint called with method:', req.method);
  console.log('[API] Query parameters:', req.query);
  console.log('[API] Request body:', req.body);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
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
        
        try {
          // Make sure the sheet exists and has headers
          const sheetInfoResponse = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: ['display_names!A1:C1'],
            includeGridData: true
          });
          
          // Check if sheet exists and has headers
          const sheetData = sheetInfoResponse.data.sheets[0];
          const hasData = sheetData?.data?.[0]?.rowData?.[0]?.values?.length > 0;
          
          if (!hasData) {
            // Create headers if they don't exist
            console.log('[API] Creating headers in display_names sheet');
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: 'display_names!A1:C1',
              valueInputOption: 'RAW',
              requestBody: {
                values: [['Wallet Address', 'Display Name', 'Last Updated']]
              }
            });
          }
          
          // Now append the new row
          console.log('[API] Appending new row to sheet');
          const appendResponse = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'display_names!A:C',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',  // Make sure we're actually inserting a new row
            requestBody: {
              values: [[walletAddress, displayName, timestamp]]
            }
          });
          
          console.log('[API] Successfully appended new row:', appendResponse.data);
        } catch (appendError) {
          console.error('[API] Error appending new display name:', appendError);
          throw new Error(`Failed to add new display name: ${appendError.message}`);
        }
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

  // Handle PUT request - Update display name for the address in query
  if (req.method === 'PUT') {
    try {
      // Get address from query parameters
      const { address } = req.query;
      // Get displayName from request body
      const { displayName } = req.body;
      
      console.log('[API] PUT request received:', { address, displayName });
      
      if (!address) {
        return res.status(400).json({
          success: false,
          message: 'address is required in the query parameters'
        });
      }
      
      if (!displayName) {
        return res.status(400).json({
          success: false,
          message: 'displayName is required in the request body'
        });
      }
      
      // Initialize sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      }
      
      // First, check if the address already has a display name
      console.log(`[API] Checking if display name exists for ${address}`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:C',
      });
      
      const rows = response.data.values || [];
      console.log(`[API] Found ${rows.length} rows in the sheet`);
      
      const rowIndex = rows.findIndex(row => row[0] === address);
      const timestamp = new Date().toISOString();
      
      // Check if the display_names sheet exists and has headers
      console.log(`[API] Verifying display_names sheet structure`);
      const sheetInfoResponse = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: ['display_names!A1:C1'],
        includeGridData: true
      });
      
      const sheetData = sheetInfoResponse.data.sheets[0];
      const hasHeaders = sheetData?.data?.[0]?.rowData?.[0]?.values?.length > 0;
      
      // Create headers if they don't exist
      if (!hasHeaders) {
        console.log(`[API] Creating headers in display_names sheet`);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'display_names!A1:C1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [['Wallet Address', 'Display Name', 'Last Updated']]
          }
        });
      }
      
      // If address not found, append a new row
      if (rowIndex === -1) {
        console.log(`[API] Adding new display name for ${address}`);
        
        const appendResponse = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'display_names!A:C',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',  // Explicitly tell it to insert rows
          requestBody: {
            values: [[address, displayName, timestamp]]
          }
        });
        
        console.log(`[API] New row added. Updated range: ${appendResponse.data.updates?.updatedRange}`);
      } 
      // If address found, update the existing row
      else {
        console.log(`[API] Updating existing display name for ${address} at row ${rowIndex + 1}`);
        
        // +1 because sheets are 1-indexed and header row counts
        const updateResponse = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `display_names!A${rowIndex + 1}:C${rowIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[address, displayName, timestamp]]
          }
        });
        
        console.log(`[API] Row updated. Updated cells: ${updateResponse.data.updatedCells}`);
      }
      
      console.log(`[API] Successfully handled display name for ${address}`);
      
      return res.status(200).json({
        success: true,
        message: 'Display name updated successfully',
        displayName: displayName
      });
    } catch (error) {
      console.error('[API] Error updating display name:', error);
      
      // Provide more detailed error information
      return res.status(500).json({
        success: false,
        message: 'Error updating display name',
        error: error.message,
        details: typeof error === 'object' ? JSON.stringify(error, null, 2) : 'Unknown error'
      });
    }
  }

  // Handle unsupported methods
  return res.status(405).json({
    success: false,
    message: `Method ${req.method} not allowed. Use GET, POST, PUT, or OPTIONS.`
  });
} 