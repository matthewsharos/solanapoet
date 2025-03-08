import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for appending values...');
    
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

    console.log('[serverless] Google Auth client initialized for sheets append');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Serverless function for appending values to Google Sheets
export default async function handler(req, res) {
  console.log('[serverless] Sheets endpoint called with method:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('[serverless] Handling OPTIONS request');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('[serverless] Method not allowed:', req.method);
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Log the incoming request body for debugging
    console.log('[serverless] Request body:', req.body);

    // Get parameters from the request body
    const { spreadsheetId, range, valueInputOption = 'RAW', values } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'Missing spreadsheetId in request body'
      });
    }
    
    if (!range) {
      return res.status(400).json({
        success: false,
        message: 'Missing range in request body'
      });
    }
    
    if (!values || !Array.isArray(values) || values.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid values array in request body'
      });
    }
    
    console.log(`[serverless] Appending values to spreadsheet ${spreadsheetId}, range: ${range}`);
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();

    // Append values to the sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: {
        values
      }
    });

    console.log('[serverless] Values appended successfully:', {
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows
    });

    return res.status(200).json({
      success: true,
      message: 'Values appended successfully',
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows
    });
  } catch (error) {
    console.error('[serverless] Error appending values to sheet:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error appending values to sheet',
      error: error.message
    });
  }
}