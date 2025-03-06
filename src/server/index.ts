import express, { Request, Response, Application, RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { getGoogleAuth } from './routes/sheets.js';

// Import routes
import authRoutes from './routes/auth.js';
import nftRoutes from './routes/nft';
import collectionRoutes from './routes/collection';
import marketRoutes from './routes/market';
import displayNamesRouter from './routes/displayNames';
import sheetsRoutes from './routes/sheets.js';
import driveRoutes from './routes/drive';
// @ts-ignore
import listingRoutes from './routes/listing-routes';
// @ts-ignore
import transactionRoutes from './routes/transaction-routes';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface HealthCheckResponse {
  status: string;
  port: number;
  timestamp: string;
  mongodb: 'connected' | 'disconnected';
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

console.log('Environment variables:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  MONGO_URI: process.env.MONGO_URI,
  VITE_GOOGLE_DRIVE_FOLDER_ID: process.env.VITE_GOOGLE_DRIVE_FOLDER_ID,
  VITE_GOOGLE_SHEETS_SPREADSHEET_ID: process.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID,
  hasHeliusApiKey: !!process.env.VITE_HELIUS_API_KEY,
  hasSolanaRpcUrl: !!process.env.VITE_SOLANA_RPC_URL
});

// Create Express app
const app: Application = express();
const PORT = 3002; // Force port 3002
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/solanapoet';

// Verify required environment variables
const requiredEnvVars = [
  'GOOGLE_CREDENTIALS_JSON',
  'VITE_GOOGLE_SHEETS_SPREADSHEET_ID',
  'VITE_GOOGLE_DRIVE_FOLDER_ID',
  'VITE_HELIUS_API_KEY',
  'VITE_SOLANA_RPC_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Verify Google Sheets credentials are available
if (!process.env.GOOGLE_CREDENTIALS_JSON) {
  console.error('GOOGLE_CREDENTIALS_JSON environment variable is not set');
  process.exit(1);
}

// Verify Google credentials are valid JSON
try {
  JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
} catch (error) {
  console.error('GOOGLE_CREDENTIALS_JSON is not valid JSON:', error);
  process.exit(1);
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

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
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
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

// MongoDB connection
let cachedDb: typeof mongoose | null = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    const db = await mongoose.connect(MONGO_URI);
    cachedDb = db;
    console.log('Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Connect to MongoDB before handling requests
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Failed to connect to database:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Remove direct server start and export app for Vercel
export default app;

// Only start server in development
if (process.env.NODE_ENV === 'development') {
  const startServer = async () => {
    try {
      await connectToDatabase();
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();
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