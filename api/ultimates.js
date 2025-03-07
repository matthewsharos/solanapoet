import { google } from 'googleapis';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for ultimates...');
    
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

    console.log('[serverless] Google Auth client initialized for ultimates');
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  } catch (error) {
    console.error('[serverless] Error initializing Google Sheets client:', error);
    throw error;
  }
}

// Serverless function for fetching ultimate NFTs data
export default async function handler(req, res) {
  console.log('[serverless] Ultimates endpoint called');
  
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
    // Get ultimate NFTs directly from Google Sheets
    console.log('Fetching ultimates directly from Google Sheets...');
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the ultimates sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'ultimates!A:D', // Adjust range as needed for your sheet
    });
    
    const rawData = response.data.values || [];
    
    // Skip header row
    const rows = rawData.slice(1);
    
    // Process and validate each row
    const ultimateNFTs = rows.map(row => {
      // Ensure we have the required fields for a valid ultimate NFT
      const nftAddress = row[0] || '';
      const name = row[1] || '';
      const owner = row[2] || '';
      const collectionId = row[3] || '';
      
      return {
        "NFT Address": nftAddress,
        "Name": name || 'Unnamed Ultimate',
        "Owner": owner,
        "collection_id": collectionId
      };
    }).filter(nft => nft["NFT Address"] && nft.collection_id);
    
    // Return the data with some debugging info
    return res.status(200).json({
      success: true,
      length: ultimateNFTs.length,
      sample: ultimateNFTs.length > 0 ? ultimateNFTs[0] : null,
      data: ultimateNFTs
    });
  } catch (error) {
    console.error('Ultimates endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching ultimates',
      error: error.message
    });
  }
} 