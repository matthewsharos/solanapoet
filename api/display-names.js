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
  console.log('[serverless] Display names endpoint called with path:', req.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse the URL to determine the action
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Log the path parts for debugging
  console.log('[serverless] Path parts:', pathParts);
  
  // Main display-names endpoint
  if (pathParts.length === 2 && pathParts[0] === 'api' && pathParts[1] === 'display-names') {
    // GET: List all display names
    if (req.method === 'GET') {
      return await getAllDisplayNames(req, res);
    }
    // POST: Add/update a display name
    else if (req.method === 'POST') {
      return await updateDisplayName(req, res);
    }
    else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  }
  // Display name by address endpoint
  else if (pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'display-names') {
    const address = pathParts[2];
    
    // GET: Get a specific display name
    if (req.method === 'GET') {
      return await getDisplayName(req, res, address);
    }
    // PUT: Update a display name
    else if (req.method === 'PUT') {
      return await updateDisplayNameByAddress(req, res, address);
    }
    else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  }
  else {
    return res.status(404).json({ success: false, message: 'Endpoint not found' });
  }
}

// Get all display names
async function getAllDisplayNames(req, res) {
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

// Get a specific display name by address
async function getDisplayName(req, res, address) {
  try {
    console.log(`Fetching display name for address: ${address}`);
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Find the row for the wallet address
    const rowIndex = await findWalletAddressRow(sheets, address);
    
    if (rowIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Display name for address ${address} not found`
      });
    }
    
    // Get the display name from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `display_names!B${rowIndex}`,
    });
    
    const displayName = response.data.values?.[0]?.[0] || '';
    
    return res.status(200).json({
      success: true,
      displayName: displayName
    });
  } catch (error) {
    console.error(`Error fetching display name for ${address}:`, error);
    return res.status(500).json({
      success: false,
      message: `Error fetching display name for ${address}`,
      error: error.message
    });
  }
}

// Update a display name (POST to /api/display-names)
async function updateDisplayName(req, res) {
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

// Update a display name by address (PUT to /api/display-names/:address)
async function updateDisplayNameByAddress(req, res, address) {
  try {
    const { displayName } = req.body;
    
    if (!displayName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Display name is required'
      });
    }
    
    console.log(`Updating display name for ${address} to "${displayName}"`);
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    // Find the row for the wallet address
    const rowIndex = await findWalletAddressRow(sheets, address);
    
    if (rowIndex === -1) {
      // Wallet address not found, append a new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'display_names!A:B',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[address, displayName]]
        }
      });
      
      console.log(`Added new display name for ${address}`);
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
      
      console.log(`Updated display name for ${address} at row ${rowIndex}`);
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Display name updated successfully'
    });
  } catch (error) {
    console.error(`Error updating display name for ${address}:`, error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error updating display name',
      message: error.message
    });
  }
} 