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
    // Check if we have cached data
    const cachedDisplayNames = getCachedData('displayNames');
    if (cachedDisplayNames) {
      console.log('Returning display names from cache');
      return res.status(200).json({
        success: true,
        displayNames: cachedDisplayNames
      });
    }

    // Check rate limits before making API call
    if (isRateLimited()) {
      console.log('Rate limit reached, returning empty results');
      return res.status(200).json({
        success: true,
        displayNames: [],
        rateLimited: true
      });
    }
    
    console.log('Fetching display names directly from Google Sheets');
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Record this API call
    recordApiCall();
    
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
    
    // Cache the results
    setCachedData('displayNames', displayNames);
    
    return res.status(200).json({
      success: true,
      displayNames: displayNames
    });
  } catch (error) {
    console.error('Error fetching display names:', error);
    console.error('Stack trace:', error.stack);
    
    // If we hit rate limits, return empty results instead of an error
    if (error.message && error.message.includes('Quota exceeded')) {
      console.warn('Google Sheets API rate limit exceeded, returning empty results');
      return res.status(200).json({
        success: true,
        displayNames: [],
        rateLimited: true
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Error fetching display names',
      message: error.message,
      stack: error.stack
    });
  }
}

// Get a specific display name by address
async function getDisplayName(req, res, address) {
  try {
    console.log(`Fetching display name for address: ${address}`);
    
    // Check cache first
    const cachedDisplayNames = getCachedData('displayNames');
    if (cachedDisplayNames) {
      const cachedName = cachedDisplayNames.find(entry => entry.walletAddress === address);
      if (cachedName) {
        console.log(`Found display name for ${address} in cache`);
        return res.status(200).json({
          success: true,
          displayName: cachedName.displayName
        });
      }
    }
    
    // Check rate limits before making API call
    if (isRateLimited()) {
      console.log('Rate limit reached, returning empty display name');
      return res.status(200).json({
        success: true,
        displayName: '',
        rateLimited: true
      });
    }
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Record this API call
    recordApiCall();
    
    // Get data from the display_names sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'display_names!A:B', // Get all display names
    });
    
    const rows = response.data.values || [];
    
    // Skip header row and find matching address
    const matchingRow = rows.slice(1).find(row => row[0] === address);
    
    if (!matchingRow) {
      return res.status(200).json({
        success: true,
        displayName: ''
      });
    }
    
    const displayName = matchingRow[1] || '';
    
    // Cache this individual result in the main cache
    if (cachedDisplayNames) {
      const updatedCache = [...cachedDisplayNames];
      const existingIndex = updatedCache.findIndex(entry => entry.walletAddress === address);
      if (existingIndex >= 0) {
        updatedCache[existingIndex].displayName = displayName;
      } else {
        updatedCache.push({ walletAddress: address, displayName });
      }
      setCachedData('displayNames', updatedCache);
    }
    
    return res.status(200).json({
      success: true,
      displayName: displayName
    });
  } catch (error) {
    console.error(`Error fetching display name for ${address}:`, error);
    console.error('Stack trace:', error.stack);
    
    // If we hit rate limits, return empty results instead of an error
    if (error.message && error.message.includes('Quota exceeded')) {
      console.warn('Google Sheets API rate limit exceeded, returning empty display name');
      return res.status(200).json({
        success: true,
        displayName: '',
        rateLimited: true
      });
    }
    
    return res.status(500).json({
      success: false,
      error: `Error fetching display name for ${address}`,
      message: error.message,
      stack: error.stack
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
    
    // Update cache
    const now = Date.now();
    const existingIndex = displayNamesCache.data.findIndex(entry => entry.walletAddress === walletAddress);
    if (existingIndex >= 0) {
      displayNamesCache.data[existingIndex].displayName = displayName;
    } else {
      displayNamesCache.data.push({ walletAddress, displayName });
    }
    displayNamesCache.timestamp = now;
    
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
    
    // Update cache
    const now = Date.now();
    const existingIndex = displayNamesCache.data.findIndex(entry => entry.walletAddress === address);
    if (existingIndex >= 0) {
      displayNamesCache.data[existingIndex].displayName = displayName;
    } else {
      displayNamesCache.data.push({ walletAddress: address, displayName });
    }
    displayNamesCache.timestamp = now;
    
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