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
  console.log('[serverless] Collections endpoint called with path:', req.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
  
  // Main collections endpoint
  if (pathParts.length === 2 && pathParts[0] === 'api' && pathParts[1] === 'collection') {
    // GET: List all collections
    if (req.method === 'GET') {
      return await getAllCollections(req, res);
    }
    // POST: Add a new collection
    else if (req.method === 'POST') {
      return await addCollection(req, res);
    }
    else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  }
  // Collection by address endpoint
  else if (pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'collection') {
    const address = pathParts[2];
    
    // GET: Get a specific collection
    if (req.method === 'GET') {
      return await getCollection(req, res, address);
    }
    // PUT: Update a collection
    else if (req.method === 'PUT') {
      return await updateCollection(req, res, address);
    }
    // DELETE: Remove a collection
    else if (req.method === 'DELETE') {
      return await removeCollection(req, res, address);
    }
    else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  }
  // Collection ultimates endpoint
  else if (pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'collection' && pathParts[3] === 'ultimates') {
    const address = pathParts[2];
    
    // PUT: Update collection ultimates status
    if (req.method === 'PUT') {
      return await updateCollectionUltimates(req, res, address);
    }
    else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  }
  else {
    return res.status(404).json({ success: false, message: 'Endpoint not found' });
  }
}

// Get all collections
async function getAllCollections(req, res) {
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

// Get a specific collection by address
async function getCollection(req, res, address) {
  try {
    console.log(`Fetching collection with address: ${address}`);
    
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
    }
    
    // Get data from the collections sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'collections!A:I',
    });
    
    const rawData = response.data.values || [];
    
    // Skip header row
    const rows = rawData.slice(1);
    
    // Find the collection with the matching address
    const collectionRow = rows.find(row => row[0] === address);
    
    if (!collectionRow) {
      return res.status(404).json({
        success: false,
        message: `Collection with address ${address} not found`
      });
    }
    
    const collection = {
      address: collectionRow[0] || '',
      name: collectionRow[1] || '',
      description: collectionRow[2] || '',
      image: collectionRow[3] || '',
      website: collectionRow[4] || '',
      twitter: collectionRow[5] || '',
      discord: collectionRow[6] || '',
      isFeatured: collectionRow[7] === 'TRUE' || collectionRow[7] === 'true',
      ultimates: collectionRow[8] === 'TRUE' || collectionRow[8] === 'true',
      collectionId: collectionRow[0] || ''
    };
    
    return res.status(200).json({
      success: true,
      collection: collection
    });
  } catch (error) {
    console.error(`Error fetching collection ${address}:`, error);
    return res.status(500).json({
      success: false,
      message: `Error fetching collection ${address}`,
      error: error.message
    });
  }
}

// Add a new collection
async function addCollection(req, res) {
  try {
    console.log('Adding new collection:', req.body);
    
    // For now, just return success
    // In a real implementation, you would add the collection to Google Sheets
    
    return res.status(200).json({
      success: true,
      message: 'Collection added successfully'
    });
  } catch (error) {
    console.error('Error adding collection:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding collection',
      error: error.message
    });
  }
}

// Update a collection
async function updateCollection(req, res, address) {
  try {
    console.log(`Updating collection ${address}:`, req.body);
    
    // For now, just return success
    // In a real implementation, you would update the collection in Google Sheets
    
    return res.status(200).json({
      success: true,
      message: 'Collection updated successfully'
    });
  } catch (error) {
    console.error(`Error updating collection ${address}:`, error);
    return res.status(500).json({
      success: false,
      message: `Error updating collection ${address}`,
      error: error.message
    });
  }
}

// Remove a collection
async function removeCollection(req, res, address) {
  try {
    console.log(`Removing collection ${address}`);
    
    // For now, just return success
    // In a real implementation, you would remove the collection from Google Sheets
    
    return res.status(200).json({
      success: true,
      message: 'Collection removed successfully'
    });
  } catch (error) {
    console.error(`Error removing collection ${address}:`, error);
    return res.status(500).json({
      success: false,
      message: `Error removing collection ${address}`,
      error: error.message
    });
  }
}

// Update collection ultimates status
async function updateCollectionUltimates(req, res, address) {
  try {
    const { ultimates } = req.body;
    console.log(`Updating ultimates status for collection ${address} to ${ultimates}`);
    
    // For now, just return success
    // In a real implementation, you would update the ultimates status in Google Sheets
    
    return res.status(200).json({
      success: true,
      message: 'Collection ultimates status updated successfully'
    });
  } catch (error) {
    console.error(`Error updating ultimates status for collection ${address}:`, error);
    return res.status(500).json({
      success: false,
      message: `Error updating ultimates status for collection ${address}`,
      error: error.message
    });
  }
} 