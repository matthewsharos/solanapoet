import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

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

    const range = `${sheetName}!A:Z`; // Get all columns
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

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

    // Validate sheet name
    const validSheets = ['display_names', 'collections', 'ultimates', 'art_requests'];
    if (!validSheets.includes(sheetName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sheet name: ${sheetName}`,
        validSheets
      });
    }

    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Get sheet data
    const data = await getSheetData(sheets, sheetName);
    
    // Return success response
    return res.status(200).json({
      success: true,
      sheet: sheetName,
      data: data,
      message: `Sheet data retrieved successfully`,
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
        stack: error instanceof Error ? error.stack : null
      },
      timestamp: new Date().toISOString(),
      debug: {
        hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
        hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
        environment: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV
      }
    });
  }
} 