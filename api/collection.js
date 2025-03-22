import { google } from 'googleapis';

// In-memory cache for collections
let collectionsCache = {
  data: null,
  timestamp: 0,
  expiresIn: 10 * 60 * 1000 // 10 minutes
};

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for collections...');
    
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

    console.log('[serverless] Google Auth client initialized for collections');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Serverless function for fetching collections data
export default async function handler(req, res) {
  console.log('[serverless] Collections endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle collection requests based on path and method
  if (req.method === 'GET') {
    if (req.query.address) {
      // Handle specific collection request (not implementing in this fix)
      return res.status(200).json({ success: false, message: 'Not implemented in this fix' });
    } else {
      return await getAllCollections(req, res);
    }
  } else {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

// Get all collections
async function getAllCollections(req, res) {
  try {
    // Check for force refresh query parameter
    const forceRefresh = req.query.refresh === 'true';
    
    // Check cache validity
    const now = Date.now();
    const cacheValid = !forceRefresh && 
                       collectionsCache.data && 
                       now - collectionsCache.timestamp < collectionsCache.expiresIn;
    
    // Return cached data if valid
    if (cacheValid) {
      console.log('[serverless] Returning cached collections data');
      return res.status(200).json({
        success: true,
        cached: true,
        length: collectionsCache.data.length,
        sample: collectionsCache.data.length > 0 ? collectionsCache.data[0] : null,
        collections: collectionsCache.data
      });
    }
    
    // Debug logging for environment variables
    console.log('[serverless] Environment variables check:', {
      hasGoogleClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasGooglePrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    });

    // Get collections directly from Google Sheets
    console.log('[serverless] Fetching collections directly from Google Sheets...');
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the collections sheet
    console.log('[serverless] Fetching data from collections sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'collections!A:G',
    });
    
    const rawData = response.data.values || [];
    console.log(`[serverless] Received ${rawData.length} rows from Google Sheets`);
    
    if (rawData.length === 0) {
      throw new Error('No data received from Google Sheets');
    }
    
    // Skip header row
    const rows = rawData.slice(1);
    
    // Process the data - EXACTLY like in the test
    const collections = rows.map(row => ({
      address: row[0] || '',
      name: row[1] || '',
      image: row[2] || '',
      description: row[3] || '',
      addedAt: row[4] ? Number(row[4]) : Date.now(),
      creationDate: row[5] || new Date().toISOString(),
      ultimates: row[6] === 'TRUE' || row[6] === 'true',
      collectionId: row[0] || ''
    })).filter(collection => collection.address && collection.name);
    
    // Update cache
    collectionsCache = {
      data: collections,
      timestamp: now,
      expiresIn: collectionsCache.expiresIn
    };
    
    // Separate collections into ultimates and regular for logging
    const ultimateCollections = collections.filter(c => c.ultimates === true);
    const regularCollections = collections.filter(c => !c.ultimates);
    
    console.log(`[serverless] Found ${collections.length} valid collections in Google Sheets`);
    console.log(`[serverless] Ultimate collections: ${ultimateCollections.length}, Regular collections: ${regularCollections.length}`);
    
    // Return the collections
    return res.status(200).json({
      success: true,
      cached: false,
      length: collections.length,
      sample: collections.length > 0 ? collections[0] : null,
      collections: collections
    });
  } catch (error) {
    console.error('[serverless] Collections endpoint error:', error);
    
    // If there was an error but we have cached data, return it
    if (collectionsCache.data) {
      console.log('[serverless] Returning cached collections data after error');
      return res.status(200).json({
        success: true,
        cached: true,
        fromErrorFallback: true,
        length: collectionsCache.data.length,
        sample: collectionsCache.data.length > 0 ? collectionsCache.data[0] : null,
        collections: collectionsCache.data
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collections',
      error: error.message
    });
  }
}