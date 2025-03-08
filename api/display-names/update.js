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

// Serverless function for updating display names
export default async function handler(req, res) {
  console.log('[serverless] Display names update endpoint called with method:', req.method);
  
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
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST instead.'
    });
  }

  try {
    // Supports both single update and batch update formats
    let updatesArray = [];
    
    if (req.body.entries) {
      // Batch update format with entries array
      if (!Array.isArray(req.body.entries) || req.body.entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'entries array must be a non-empty array'
        });
      }
      updatesArray = req.body.entries;
    } else if (req.body.walletAddress && req.body.displayName) {
      // Single update format
      updatesArray = [{
        walletAddress: req.body.walletAddress,
        displayName: req.body.displayName
      }];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either walletAddress+displayName or entries array is required'
      });
    }
    
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
    const timestamp = new Date().toISOString();
    
    // Process each update
    const results = [];
    
    for (const { walletAddress, displayName } of updatesArray) {
      if (!walletAddress || !displayName) {
        console.warn('[serverless] Skipping invalid entry:', { walletAddress, displayName });
        results.push({ walletAddress, success: false, message: 'Invalid entry' });
        continue;
      }
      
      console.log(`[serverless] Processing update for ${walletAddress} to: ${displayName}`);
      
      try {
        const rowIndex = rows.findIndex(row => row[0] === walletAddress);
        
        // If address not found, append a new row
        if (rowIndex === -1) {
          console.log(`[serverless] Adding new display name for ${walletAddress}`);
          
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
          console.log(`[serverless] Updating existing display name for ${walletAddress} at row ${rowIndex + 1}`);
          
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
        
        results.push({ 
          walletAddress, 
          displayName, 
          success: true 
        });
      } catch (error) {
        console.error(`[serverless] Error updating ${walletAddress}:`, error);
        results.push({ 
          walletAddress, 
          success: false, 
          message: error.message 
        });
      }
    }
    
    const allSuccessful = results.every(r => r.success);
    
    console.log('[serverless] Update results:', results);
    
    return res.status(200).json({
      success: allSuccessful,
      message: allSuccessful 
        ? 'All display names updated successfully' 
        : 'Some display name updates failed',
      results,
      displayName: updatesArray.length === 1 ? updatesArray[0].displayName : undefined
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