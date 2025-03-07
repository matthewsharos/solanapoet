import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client...');
    
    // Check for different authentication methods
    let auth;
    
    // Method 1: Direct environment variables (GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY)
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('[serverless] Using direct environment variables for authentication');
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    } 
    // Method 2: GOOGLE_APPLICATION_CREDENTIALS file path
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('[serverless] Using credentials file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }
    // No valid authentication method
    else {
      throw new Error('No Google authentication method available. Set GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS');
    }

    const sheets = google.sheets({ version: 'v4', auth });
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
      throw new Error('Spreadsheet ID not configured');
    }

    console.log(`[serverless] Fetching sheet ${sheetName} from spreadsheet ${spreadsheetId.substring(0, 4)}...`);
    const range = `${sheetName}!A:Z`; // Get all columns
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    // Log success and row count
    console.log(`[serverless] Successfully fetched ${response.data.values?.length || 0} rows from ${sheetName}`);
    return response.data.values || [];
  } catch (error) {
    console.error(`[serverless] Error fetching sheet ${sheetName}:`, error);
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

    // Verify environment variables first
    const envCheck = {
      hasGoogleCredentials: !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    };

    if (!envCheck.hasGoogleCredentials || !envCheck.hasSpreadsheetId) {
      console.error('[serverless] Missing required environment variables:', {
        hasGoogleCredentials: envCheck.hasGoogleCredentials,
        hasSpreadsheetId: envCheck.hasSpreadsheetId
      });
      
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Missing required environment variables',
        details: {
          hasGoogleCredentials: envCheck.hasGoogleCredentials,
          hasSpreadsheetId: envCheck.hasSpreadsheetId
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Initialize Google Sheets client
    console.log('[serverless] Getting Google Sheets client...');
    const sheets = await getGoogleSheetsClient();
    
    // Get sheet data
    console.log(`[serverless] Fetching data from sheet: ${sheetName}`);
    const rawData = await getSheetData(sheets, sheetName);
    
    if (!rawData || !Array.isArray(rawData)) {
      console.error(`[serverless] Invalid data received from sheet ${sheetName}:`, rawData);
      return res.status(500).json({
        success: false,
        message: `Invalid data format from sheet ${sheetName}`,
        timestamp: new Date().toISOString()
      });
    }
    
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
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error.name,
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : null) : null
      },
      timestamp: new Date().toISOString(),
      debug: {
        hasGoogleCredentials: !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        environment: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV
      }
    });
  }
} 