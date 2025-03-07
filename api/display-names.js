import { google } from 'googleapis';
import { isRateLimited, recordApiCall, getCachedData, setCachedData } from '../utils/googleSheetsCache';

// Simple in-memory cache for display names
let displayNamesCache = {
  data: [],
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes cache TTL
};

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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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
    const range = 'display_names!A:C'; // Update range to include updated_at column
    
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
  try {
    console.log('[serverless] Display names endpoint called with path:', req.url);
    
    // Debug logging for environment variables
    console.log('[serverless] Environment variables check:', {
      hasGoogleClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasGooglePrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    });
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Parse the URL path
    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Handle display-names requests based on path and method
    if (pathParts.length === 2 && pathParts[1] === 'display-names') {
      // GET: List all display names
      if (req.method === 'GET') {
        return await getAllDisplayNames(req, res);
      } else {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
      }
    } 
    // Display name by address endpoint
    else if (pathParts.length === 3 && pathParts[1] === 'display-names') {
      const address = pathParts[2];
      
      // GET: Get a specific display name
      if (req.method === 'GET') {
        return await getDisplayName(req, res, address);
      }
      // PUT: Update a display name
      else if (req.method === 'PUT') {
        return await updateDisplayName(req, res, address);
      }
      else {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
      }
    }
    else {
      return res.status(404).json({ success: false, message: 'Endpoint not found' });
    }
  } catch (error) {
    console.error('[serverless] Error in display names endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      stack: error.stack
    });
  }
}

// Get all display names
async function getAllDisplayNames(req, res) {
  try {
    console.log('[serverless] Fetching all display names from Google Sheets');
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the display_names sheet
    console.log('[serverless] Fetching data from display_names sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'display_names!A:C',
    });
    
    const rawData = response.data.values || [];
    console.log(`[serverless] Received ${rawData.length} rows from display_names sheet`);
    
    // Skip header row
    const rows = rawData.slice(1);
    
    // Process rows into display names
    const displayNames = rows.map(row => ({
      walletAddress: (row[0] || '').toLowerCase(),
      displayName: row[1] || '',
      updated_at: row[2] || new Date().toISOString()
    })).filter(entry => entry.walletAddress && entry.displayName);
    
    console.log(`[serverless] Found ${displayNames.length} valid display names`);
    
    return res.status(200).json({
      success: true,
      displayNames: displayNames
    });
  } catch (error) {
    console.error('[serverless] Error fetching all display names:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching display names',
      error: error.message
    });
  }
}

// Get a specific display name by address
async function getDisplayName(req, res, address) {
  try {
    console.log(`[serverless] Fetching display name for address: ${address}`);
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the display_names sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'display_names!A:C',
    });
    
    const rows = response.data.values || [];
    
    // Skip header row and find the matching address
    let displayName = null;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toLowerCase() === address.toLowerCase()) {
        displayName = rows[i][1] || '';
        break;
      }
    }
    
    if (displayName) {
      console.log(`[serverless] Found display name "${displayName}" for address ${address}`);
      return res.status(200).json({
        success: true,
        displayName: displayName
      });
    } else {
      console.log(`[serverless] No display name found for address ${address}`);
      return res.status(200).json({
        success: true,
        displayName: null
      });
    }
  } catch (error) {
    console.error(`[serverless] Error fetching display name for ${address}:`, error);
    return res.status(500).json({ 
      success: false, 
      message: `Error fetching display name for ${address}`,
      error: error.message
    });
  }
}

// Update a display name by address
async function updateDisplayName(req, res, address) {
  try {
    console.log(`[serverless] Updating display name for address: ${address}`);
    const { displayName } = req.body;
    
    if (!displayName) {
      return res.status(400).json({
        success: false,
        message: 'Display name is required'
      });
    }
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the display_names sheet to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'display_names!A:C',
    });
    
    const rows = response.data.values || [];
    let rowIndex = -1;
    
    // Skip header row and find the matching address
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toLowerCase() === address.toLowerCase()) {
        rowIndex = i + 1; // 1-indexed for sheets API
        break;
      }
    }
    
    const updatedAt = new Date().toISOString();
    
    if (rowIndex > 0) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `display_names!B${rowIndex}:C${rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[displayName, updatedAt]]
        }
      });
      
      console.log(`[serverless] Updated display name for ${address} to "${displayName}"`);
    } else {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'display_names!A:C',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [[address, displayName, updatedAt]]
        }
      });
      
      console.log(`[serverless] Added new display name for ${address}: "${displayName}"`);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Display name updated successfully'
    });
  } catch (error) {
    console.error(`[serverless] Error updating display name for ${address}:`, error);
    return res.status(500).json({ 
      success: false, 
      message: `Error updating display name for ${address}`,
      error: error.message
    });
  }
}