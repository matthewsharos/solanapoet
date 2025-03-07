import axios from 'axios';
import { google } from 'googleapis';
import { isRateLimited, recordApiCall, getCachedData, setCachedData } from '../utils/googleSheetsCache';

// Helper function to initialize Google Sheets client
async function getGoogleSheetsClient() {
  try {
    console.log('[serverless] Initializing Google Sheets client for collections...');
    
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.error('[serverless] Missing Google API credentials:', {
        hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY
      });
      throw new Error('Missing Google API credentials');
    }
    
    // Ensure private key is properly formatted - use the exact same approach as ultimates.js
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    console.log('[serverless] Creating Google Auth client...');
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
    console.error('[serverless] Stack trace:', error.stack);
    throw error;
  }
}

// Serverless function for fetching collections data
export default async function handler(req, res) {
  console.log('[serverless] Collections endpoint called with path:', req.url);
  console.log('[serverless] Request method:', req.method);
  console.log('[serverless] Request headers:', req.headers);
  console.log('[serverless] Request query:', req.query);
  
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
    // Debug logging for environment variables
    console.log('[serverless] Environment variables check:', {
      hasHeliusKey: !!process.env.HELIUS_API_KEY,
      hasGoogleClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasGooglePrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      vercelEnv: process.env.VERCEL_ENV || 'unknown'
    });

    // Use the simpler, more direct approach like in ultimates.js
    try {
      // Initialize Google Sheets client
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        console.error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
        throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not configured');
      }
      
      // Get data from the collections sheet
      console.log('Fetching data from collections sheet...');
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'collections!A:G',
      });
      
      const rows = response.data.values || [];
      console.log(`Received ${rows.length} rows from Google Sheets`);
      
      if (rows.length === 0) {
        console.error('No data received from Google Sheets');
        throw new Error('No data received from Google Sheets');
      }
      
      // Skip header row
      const dataRows = rows.slice(1);
      console.log('Raw data rows:', dataRows.length);
      
      // Process the data - EXACTLY like in the test
      const collections = dataRows.map(row => ({
        address: row[0] || '',
        name: row[1] || '',
        image: row[2] || '',
        description: row[3] || '',
        addedAt: row[4] ? Number(row[4]) : Date.now(),
        creationDate: row[5] || new Date().toISOString(),
        ultimates: row[6] === 'TRUE' || row[6] === 'true',
        collectionId: row[0] || ''
      })).filter(collection => collection.address && collection.name);
      
      // Separate collections into ultimates and regular for logging
      const ultimateCollections = collections.filter(c => c.ultimates === true);
      const regularCollections = collections.filter(c => !c.ultimates);
      
      console.log(`Found ${collections.length} valid collections in Google Sheets`);
      console.log(`Ultimate collections: ${ultimateCollections.length}, Regular collections: ${regularCollections.length}`);
      
      // Return the collections from Google Sheets
      return res.status(200).json({
        success: true,
        length: collections.length,
        sample: collections[0] || null,
        collections: collections,
        ultimateCount: ultimateCollections.length,
        regularCount: regularCollections.length
      });
    } catch (sheetError) {
      console.error('Error fetching collections from Google Sheets:', sheetError);
      console.error('Stack trace:', sheetError.stack);
      // If Google Sheets fails, try the Helius API
      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (heliusApiKey) {
        return await getHeliusCollections(req, res, heliusApiKey);
      } else {
        throw sheetError; // Re-throw if no fallback available
      }
    }
  } catch (error) {
    console.error('Collections endpoint error:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching collections',
      error: error.message,
      stack: error.stack
    });
  }
}

// Helper function to get collections from Helius
async function getHeliusCollections(req, res, heliusApiKey) {
  console.log('Fetching collections from Helius...');
  
  try {
    // Use Helius to get top collections 
    const heliusResponse = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getTopCollections",
        params: { limit: 10 }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    
    if (heliusResponse.data.result) {
      const collections = heliusResponse.data.result.map(collection => ({
        address: collection.id,
        name: collection.name,
        description: collection.description || '',
        image: collection.image || '',
        website: collection.externalUrl || '',
        twitter: collection.twitter || '',
        discord: collection.discord || '',
        isFeatured: false,
        ultimates: false,
        collectionId: collection.id
      }));
      
      console.log(`Found ${collections.length} collections from Helius`);
      
      // Cache these results too
      setCachedData('collections', collections);
      
      return res.status(200).json({
        success: true,
        length: collections.length,
        sample: collections[0] || null,
        collections: collections,
        source: 'helius'
      });
    }
    
    // If we get here, return empty results
    return res.status(200).json({
      success: true,
      length: 0,
      sample: null,
      collections: []
    });
    
  } catch (error) {
    console.error('Error fetching from Helius:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching collections from Helius',
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
      range: 'collections!A:G',
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
      image: collectionRow[2] || '',
      description: collectionRow[3] || '',
      addedAt: collectionRow[4] ? Number(collectionRow[4]) : Date.now(),
      creationDate: collectionRow[5] || new Date().toISOString(),
      ultimates: collectionRow[6] === 'TRUE' || collectionRow[6] === 'true',
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