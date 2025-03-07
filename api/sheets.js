import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for Vercel environment...');
    
    // For Vercel production, we should always use environment variables
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.error('[serverless] Missing required Google credentials environment variables');
      throw new Error('Missing Google API credentials: GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be set in Vercel environment variables');
    }
    
    // Ensure private key is properly formatted
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    // Log masked values for debugging
    console.log('[serverless] Using Google credentials from environment variables:', {
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL.substring(0, 5) + '...',
      privateKeyLength: privateKey.length,
      privateKeyStart: privateKey.substring(0, 15) + '...'
    });
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    console.log('[serverless] Google Auth client initialized');
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('[serverless] Google Sheets client created successfully');
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Helper function to get sheet data
async function getSheetData(sheets, sheetName) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }

    console.log(`[serverless] Fetching sheet ${sheetName} from spreadsheet ${spreadsheetId.substring(0, 5)}...`);
    
    // Try with different sheet range formats
    const range = `${sheetName}!A:Z`; // Get all columns
    
    console.log(`[serverless] Requesting range: ${range}`);
    
    // Use a promise with timeout to prevent hanging
    const timeoutMs = 10000; // 10 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    
    const fetchPromise = sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    // Race the fetch against the timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!response.data || !response.data.values) {
      console.warn(`[serverless] No data found in sheet ${sheetName}`);
      return [];
    }
    
    // Log success and row count
    console.log(`[serverless] Successfully fetched ${response.data.values.length} rows from ${sheetName}`);
    return response.data.values;
  } catch (error) {
    console.error(`[serverless] Error fetching sheet ${sheetName}:`, error);
    
    // Try to provide more context on the error
    if (error.response) {
      console.error(`[serverless] Google Sheets API error response:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    throw error;
  }
}

// Serverless function handler for Google Sheets API
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get the requested sheet name from the URL path or query parameter
    const sheetName = req.query.sheet || 
                     (req.url.match(/\/api\/sheets\/([^\/\?]+)/) || [])[1] || 
                     'unknown';
    
    console.log(`[serverless] Sheets API called for sheet: ${sheetName}`);
    console.log(`[serverless] Request URL: ${req.url}`);
    console.log(`[serverless] Query params:`, req.query);

    // Validate sheet name
    const validSheets = ['display_names', 'collections', 'ultimates', 'art_requests'];
    if (!validSheets.includes(sheetName)) {
      console.warn(`[serverless] Invalid sheet name requested: ${sheetName}`);
      return res.status(400).json({
        success: false,
        message: `Invalid sheet name: ${sheetName}`,
        validSheets,
        timestamp: new Date().toISOString()
      });
    }

    // Verify required environment variables for Vercel
    const requiredEnvVars = {
      GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_SHEETS_SPREADSHEET_ID: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    };
    
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);
    
    if (missingVars.length > 0) {
      console.error(`[serverless] Missing required environment variables: ${missingVars.join(', ')}`);
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing required environment variables',
        missingVars,
        timestamp: new Date().toISOString()
      });
    }
    
    // Initialize Google Sheets client
    console.log('[serverless] Getting Google Sheets client...');
    const sheets = await getGoogleSheetsClient();
    
    // Get sheet data
    console.log(`[serverless] Fetching data from sheet: ${sheetName}`);
    const rawData = await getSheetData(sheets, sheetName);
    
    // Process the data - first row should be headers
    console.log(`[serverless] Processing ${rawData.length} rows from ${sheetName}`);
    
    const headers = rawData[0] || [];
    const data = rawData.slice(1).map(row => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) { // Only include columns with headers
          item[header] = row[index] || '';
        }
      });
      return item;
    });
    
    // Return success response
    console.log(`[serverless] Successfully returned ${data.length} processed rows from ${sheetName}`);
    return res.status(200).json({
      success: true,
      sheet: sheetName,
      data: data,
      message: `Sheet data retrieved successfully`,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[serverless] Error in sheets endpoint:`, error);
    
    // Return error response with more details
    return res.status(500).json({
      success: false,
      message: 'Error fetching sheet data',
      error: {
        message: error.message || 'Unknown error',
        type: error.name || 'Error'
      },
      timestamp: new Date().toISOString(),
      debug: {
        vercelEnv: process.env.VERCEL_ENV || 'unknown',
        hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        hasGoogleClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
        hasGooglePrivateKey: !!process.env.GOOGLE_PRIVATE_KEY 
          ? `${process.env.GOOGLE_PRIVATE_KEY.length} chars` 
          : 'missing'
      }
    });
  }
} 