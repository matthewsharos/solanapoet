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

// Hardcoded fallback display names in case the API fails
const fallbackDisplayNames = [
  { walletAddress: "art5dr4bdic2sqvzofheemuxwqq5vgsx9he7jxhcxnqd", displayName: "DegenPoet" },
  { walletAddress: "cknhwze3kyn24bapmewekce9fnj6dpgnrhjn2ywd7", displayName: "Jack" },
  { walletAddress: "copufhaobbdchxeczoubehjpijf3xvq1jnxdf9cmh3xz", displayName: "Daniel" },
  { walletAddress: "hhlja5ewvjygtkkswp9xgyfygdsdrz4mpd1vhpzc5ae", displayName: "Mary" }
];

// Serverless function for display names API
export default async function handler(req, res) {
  console.log('[serverless] Display names endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get the address parameter from the URL if present
    const { address } = req.query;
    
    try {
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        console.warn('[serverless] Missing spreadsheet ID, using fallback data');
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
        walletAddress: (row[0] || '').toLowerCase(),
        displayName: row[1] || '',
        updated_at: row[2] || new Date().toISOString()
      })).filter(entry => entry.walletAddress && entry.displayName);
      
      console.log(`[serverless] Found ${displayNames.length} display names`);
      
      // If an address is provided, return just that one
      if (address) {
        const normalizedAddress = address.toLowerCase();
        const match = displayNames.find(entry => entry.walletAddress === normalizedAddress);
        
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
      console.error('[serverless] Error fetching from Google Sheets, using fallback data:', sheetsError);
      
      // Use fallback data if Google Sheets fails
      if (address) {
        const normalizedAddress = address.toLowerCase();
        const match = fallbackDisplayNames.find(entry => entry.walletAddress === normalizedAddress);
        
        if (match) {
          console.log(`[serverless] Found fallback display name for address ${address}: ${match.displayName}`);
          return res.status(200).json({
            success: true,
            displayName: match.displayName,
            fromFallback: true
          });
        } else {
          console.log(`[serverless] No fallback display name found for address ${address}`);
          return res.status(200).json({
            success: true,
            displayName: null,
            fromFallback: true
          });
        }
      }
      
      // Return fallback display names
      return res.status(200).json({
        success: true,
        displayNames: fallbackDisplayNames,
        fromFallback: true
      });
    }
  } catch (error) {
    console.error('[serverless] Display names endpoint error:', error);
    return res.status(200).json({ 
      success: false, 
      message: 'Error fetching display names',
      error: error.message,
      displayNames: fallbackDisplayNames,
      fromFallback: true
    });
  }
}