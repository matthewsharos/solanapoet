import express, { Request, Response, Application, RequestHandler, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { getGoogleAuth } from './routes/sheets.js';

// Import routes
import authRoutes from './routes/auth.js';
import nftRoutes from './routes/nft.js';
import collectionRoutes from './routes/collection.js';
import marketRoutes from './routes/market.js';
import displayNamesRouter from './routes/displayNames.js';
import sheetsRoutes from './routes/sheets.js';
import driveRoutes from './routes/drive.js';
// @ts-ignore
import listingRoutes from './routes/listing-routes.js';
// @ts-ignore
import transactionRoutes from './routes/transaction-routes.js';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface HealthCheckResponse {
  status: string;
  port: number;
  timestamp: string;
  environment: string;
}

interface CheckSellerRequest {
  nftAddress: string;
  walletAddress: string;
}

interface CheckSellerResponse {
  success: boolean;
  isOriginalSeller: boolean;
  message: string;
}

interface Listing {
  id: string;
  [key: string]: any;
}

// Load environment variables first
dotenv.config();

// Debug environment variables
console.log('Server starting with environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
  hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  hasDriveFolderId: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
  hasFrontendUrl: !!process.env.FRONTEND_URL,
  hasHeliusApiKey: !!process.env.VITE_HELIUS_API_KEY,
  hasSolanaRpcUrl: !!process.env.VITE_SOLANA_RPC_URL
});

// Process environment variables before server startup
if (process.env.GOOGLE_PRIVATE_KEY && !process.env.GOOGLE_PRIVATE_KEY.includes('\n') && process.env.GOOGLE_PRIVATE_KEY.includes('\\n')) {
  console.log('Converting escaped newlines in private key to actual newlines');
  process.env.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

// Create Express app
const app: Application = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Add better error logging middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler caught:', {
    error: err instanceof Error ? {
      message: err.message,
      stack: err.stack,
      name: err.name
    } : err,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    env: {
      hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      nodeEnv: process.env.NODE_ENV
    }
  });
  
  if (!res.headersSent) {
    res.status(500).json({
      error: {
        code: '500',
        message: err instanceof Error ? err.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      }
    });
  }
  next(err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the dist directory
  console.log('Serving frontend from dist directory');
  
  // Try multiple possible locations for the static files
  const possibleDistPaths = [
    path.join(__dirname, '../../dist'),
    '/var/task/dist',
    path.join(process.cwd(), 'dist')
  ];
  
  // Log the possible paths for debugging
  console.log('Checking for static files in paths:', possibleDistPaths);
  
  // Try each path and use the first one that exists
  for (const distPath of possibleDistPaths) {
    if (fs.existsSync(distPath)) {
      console.log(`Found static files at: ${distPath}`);
      app.use(express.static(distPath));
      break;
    }
  }
}

// API routes
console.log('Registering API routes...');
app.use('/api/auth', authRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/collection', collectionRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/listing', listingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/display-names', displayNamesRouter);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/drive', driveRoutes);
console.log('API routes registered');

// Pass environment variables to the client
app.get('/api/config', (req: Request, res: Response) => {
  try {
    // Debug log all relevant environment variables
    console.log('Environment variables state:', {
      NODE_ENV: process.env.NODE_ENV,
      hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
      clientEmailLength: process.env.GOOGLE_CLIENT_EMAIL?.length || 0,
      privateKeyLength: process.env.GOOGLE_PRIVATE_KEY?.length || 0,
      hasSpreadsheetIdEnv: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 'not set'
    });

    // Check if required environment variables are present
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.error('Google authentication credentials are not set');
      return res.status(500).json({
        error: {
          code: 'MISSING_GOOGLE_CREDENTIALS',
          message: 'Google authentication credentials are not set'
        }
      });
    }

    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      console.error('Google Sheets spreadsheet ID is not set');
      return res.status(500).json({
        error: {
          code: 'MISSING_SPREADSHEET_ID',
          message: 'Google Sheets spreadsheet ID is not set'
        }
      });
    }

    // Check for GOOGLE_CLIENT_EMAIL
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    let private_key = process.env.GOOGLE_PRIVATE_KEY;

    // Convert escaped newlines to actual newlines if necessary
    if (private_key?.includes('\\n')) {
      console.log('Converting escaped newlines in private key to actual newlines');
      private_key = private_key.replace(/\\n/g, '\n');
    }

    // Initialize Google auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email,
        private_key
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });

    const sheetConfig = {
      auth,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    };

    // Return a success response
    res.json({
      success: true,
      config: {
        googleSheets: {
          configured: true,
          spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
        },
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    console.error('Error in /api/config:', error);
    res.status(500).json({
      error: {
        code: 'CONFIG_ERROR',
        message: error instanceof Error ? error.message : 'Error retrieving configuration'
      }
    });
  }
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response<HealthCheckResponse>) => {
  res.json({
    status: 'ok',
    port: Number(process.env.PORT) || 3002,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Add a catch-all route to serve the frontend for client-side routing
// This should be added after all API routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res, next) => {
    // Exclude API routes from this catch-all
    if (!req.path.startsWith('/api/')) {
      console.log(`Serving index.html for path: ${req.path}`);
      
      // Try multiple possible locations for index.html
      const possibleIndexPaths = [
        path.join(__dirname, '../../dist/index.html'),
        '/var/task/dist/index.html',
        path.join(process.cwd(), 'dist/index.html')
      ];
      
      // Try to find and serve index.html from one of the possible paths
      for (const indexPath of possibleIndexPaths) {
        if (fs.existsSync(indexPath)) {
          console.log(`Found index.html at: ${indexPath}`);
          return res.sendFile(indexPath);
        }
      }
      
      // If we reach here, we couldn't find index.html in any of the expected locations
      console.error(`Error: Could not find index.html in any of these paths:`, possibleIndexPaths);
      return next(new Error('Could not find index.html'));
    } else {
      next();
    }
  });
}

// Add catch-all route for debugging
app.use((req: Request, res: Response, next) => {
  console.log('Request received:', {
    method: req.method,
    url: req.url,
    params: req.params,
    query: req.query,
    body: req.body
  });
  next();
});

// Health check route
app.get('/health', (req: Request, res: Response) => {
  const healthcheck = {
    status: 'ok',
    port: PORT,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  try {
    res.json(healthcheck);
  } catch (error) {
    healthcheck.status = 'error';
    res.status(503).json(healthcheck);
  }
});

// Add check-seller endpoint
const checkSellerHandler = async (req: Request<{}, CheckSellerResponse, CheckSellerRequest>, res: Response): Promise<void> => {
  try {
    console.log('Check seller request received:', req.body);
    
    // Validate request parameters
    const { nftAddress, walletAddress } = req.body;
    
    if (!nftAddress || !walletAddress) {
      const response: CheckSellerResponse = {
        success: false,
        isOriginalSeller: false,
        message: 'Missing required parameters: nftAddress and walletAddress are required'
      };
      res.status(400).json(response);
      return;
    }
    
    // Special case for royalty receiver
    const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
    if (walletAddress === ROYALTY_RECEIVER_ADDRESS) {
      console.log(`ROYALTY RECEIVER OVERRIDE: Automatically verifying ${walletAddress} as seller for NFT ${nftAddress}`);
      const response: CheckSellerResponse = {
        success: true,
        isOriginalSeller: true,
        message: 'Royalty receiver is always verified as seller'
      };
      res.status(200).json(response);
      return;
    }
    
    // Use the verifySellerAddress function from googleSheets.js
    // @ts-ignore
    const { verifySellerAddress } = await import('../utils/googleSheets');
    const isOriginalSeller = await verifySellerAddress(nftAddress, walletAddress);
    
    console.log(`Seller verification result for NFT ${nftAddress} and wallet ${walletAddress}: ${isOriginalSeller}`);
    
    const response: CheckSellerResponse = {
      success: true,
      isOriginalSeller,
      message: isOriginalSeller ? 'Wallet is verified as the original seller' : 'Wallet is not the original seller'
    };
    res.status(200).json(response);
    return;
  } catch (error) {
    console.error('Error checking seller:', error);
    const response: CheckSellerResponse = {
      success: false,
      isOriginalSeller: false,
      message: `Error checking seller: ${error instanceof Error ? error.message : String(error)}`
    };
    res.status(500).json(response);
    return;
  }
};

app.post('/check-seller', checkSellerHandler);

// Remove MongoDB connection code and middleware
export default app;

// Only start server in development
if (process.env.NODE_ENV === 'development') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

const collectionsFilePath = path.join(__dirname, 'collections.json');
const listingsFilePath = path.join(__dirname, 'listings.json');

// Function to read JSON file
function readJSONFile<T>(filePath: string): T[] {
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }
  return [];
}

// Function to write JSON file
function writeJSONFile<T>(filePath: string, data: T[]): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Load collections and listings on startup
const validCollections: string[] = readJSONFile(collectionsFilePath);
const currentListings: Listing[] = readJSONFile(listingsFilePath);

// Example usage: Add a new collection ID
function addCollectionID(collectionID: string): void {
  if (!validCollections.includes(collectionID)) {
    validCollections.push(collectionID);
    writeJSONFile(collectionsFilePath, validCollections);
  }
}

// Example usage: Add a new listing
function addListing(listing: Listing): void {
  if (!currentListings.some(l => l.id === listing.id)) {
    currentListings.push(listing);
    writeJSONFile(listingsFilePath, currentListings);
  }
}

// Export functions for use in other parts of the app
export {
  addCollectionID,
  addListing,
  validCollections,
  currentListings
};

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
}); 