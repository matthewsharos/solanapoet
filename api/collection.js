import axios from 'axios';
import { google } from 'googleapis';

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
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    // Try to get collection data from Google Sheets first
    console.log('Attempting to fetch collections directly from Google Sheets...');
    let collections = [];
    
    try {
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
      }
      
      // Get data from the collections sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'collections!A:I', // Adjust range as needed for your sheet
      });
      
      const rawData = response.data.values || [];
      
      // Skip header row
      const rows = rawData.slice(1);
      
      collections = rows.map(row => ({
        address: row[0] || '',
        name: row[1] || '',
        description: row[2] || '',
        image: row[3] || '',
        website: row[4] || '',
        twitter: row[5] || '',
        discord: row[6] || '',
        isFeatured: row[7] === 'TRUE' || row[7] === 'true',
        ultimates: row[8] === 'TRUE' || row[8] === 'true',
        collectionId: row[0] || '' // Ensure collectionId is set to address for compatibility
      })).filter(collection => collection.address && collection.name);
      
      console.log(`Found ${collections.length} collections in Google Sheets`);
    } catch (sheetError) {
      console.error('Error fetching collections from Google Sheets:', sheetError);
      // Continue execution to try fetching from Helius as fallback
    }
    
    // If we couldn't get collections from Google Sheets, try Helius as fallback
    if (collections.length === 0) {
      console.log('No collections found in Google Sheets, using Helius as fallback...');
      
      // Use Helius to get top collections 
      const heliusResponse = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
        {
          jsonrpc: "2.0",
          id: "top-collections",
          method: "getTopCollections",
          params: { limit: 10 }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      
      if (heliusResponse.data.result) {
        collections = heliusResponse.data.result.map(collection => ({
          address: collection.id,
          name: collection.name,
          description: collection.description || '',
          image: collection.image || '',
          website: collection.externalUrl || '',
          twitter: collection.twitter || '',
          discord: collection.discord || '',
          isFeatured: false,
          ultimates: false,
          collectionId: collection.id // Ensure collectionId is set to id for compatibility
        }));
        
        console.log(`Found ${collections.length} collections from Helius`);
      }
    }
    
    // Return either the Google Sheets collections or Helius collections
    // Include a sample collection for debugging
    const sampleCollection = collections.length > 0 ? collections[0] : null;
    
    return res.status(200).json({
      success: true,
      length: collections.length,
      sample: sampleCollection,
      collections: collections
    });

  } catch (error) {
    console.error('Collections endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collections',
      error: error.message
    });
  }
} 