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

// Serverless function for display names API
export default async function handler(req, res) {
  console.log('[serverless] Display names endpoint called with method:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('[serverless] Handling OPTIONS request');
    return res.status(200).end();
  }

  // Handle PUT method (update display name)
  if (req.method === 'PUT') {
    try {
      const { address } = req.query;
      const { displayName } = req.body;
      
      console.log('[serverless] PUT request received for display name update:', { address, displayName });
      
      if (!address) {
        return res.status(400).json({ 
          success: false, 
          message: 'Address parameter is required' 
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

  // Handle POST method (bulk update or create)
  if (req.method === 'POST') {
    try {
      const { entries } = req.body;
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'entries array is required in the request body'
        });
      }
      
      // Initialize sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
      }
      
      // Fetch existing data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'display_names!A:C',
      });
      
      const rows = response.data.values || [];
      const timestamp = new Date().toISOString();
      
      // Process each entry
      const updatePromises = entries.map(async ({ walletAddress, displayName }) => {
        if (!walletAddress || !displayName) {
          console.warn('[serverless] Skipping invalid entry:', { walletAddress, displayName });
          return;
        }
        
        const rowIndex = rows.findIndex(row => row[0] === walletAddress);
        
        if (rowIndex === -1) {
          // Append new row for new addresses
          return sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'display_names!A:C',
            valueInputOption: 'RAW',
            requestBody: {
              values: [[walletAddress, displayName, timestamp]]
            }
          });
        } else {
          // Update existing rows
          return sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `display_names!A${rowIndex + 1}:C${rowIndex + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [[walletAddress, displayName, timestamp]]
            }
          });
        }
      });
      
      await Promise.all(updatePromises);
      
      return res.status(200).json({
        success: true,
        message: 'Display names updated successfully',
        count: entries.length
      });
    } catch (error) {
      console.error('[serverless] Error updating display names:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error updating display names',
        error: error.message
      });
    }
  }

  // Handle GET method (read display names)
  if (req.method === 'GET') {
    try {
      // Get the address parameter from the URL if present
      const { address } = req.query;
      
      try {
        // Initialize Google Sheets client
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        
        if (!spreadsheetId) {
          console.warn('[serverless] Missing spreadsheet ID');
          throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not configured');
        }
        
        // Get data from the display_names sheet
        console.log('[serverless] Fetching data from display_names sheet...');
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
        
        console.log(`[serverless] Found ${displayNames.length} display names`);
        
        // If an address is provided, return just that one
        if (address) {
          const match = displayNames.find(entry => entry.walletAddress === address);
          
          if (match) {
            console.log(`[serverless] Found display name for address ${address}: ${match.displayName}`);
            return res.status(200).json({
              success: true,
              displayName: match.displayName
            });
          } else {
            console.log(`[serverless] No display name found for address ${address}`);
            return res.status(200).json({
              success: true,
              displayName: null
            });
          }
        }
        
        // Return all display names
        return res.status(200).json({
          success: true,
          displayNames: displayNames
        });
        
      } catch (sheetsError) {
        console.error('[serverless] Error fetching from Google Sheets:', sheetsError);
        
        // Return empty results if Google Sheets fails
        if (address) {
          return res.status(200).json({
            success: true,
            displayName: null
          });
        }
        
        // Return empty display names
        return res.status(200).json({
          success: true,
          displayNames: []
        });
      }
    } catch (error) {
      console.error('[serverless] Display names endpoint error:', error);
      return res.status(200).json({ 
        success: false, 
        message: 'Error fetching display names',
        error: error.message,
        displayNames: []
      });
    }
  }
  
  // If we reached here, the method is not supported
  return res.status(405).json({ 
    success: false, 
    message: `Method ${req.method} not allowed` 
  });
}