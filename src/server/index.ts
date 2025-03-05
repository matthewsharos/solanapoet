import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sheetsRouter from './api/sheets';  // Remove .js extension
import driveRouter from './api/drive';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/auth';
import nftRoutes from './routes/nft';
import collectionRoutes from './routes/collection';
import marketRoutes from './routes/market';
// @ts-ignore
import listingRoutes from './routes/listing-routes';
// @ts-ignore
import transactionRoutes from './routes/transaction-routes';

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

// Create Express app
const app: Application = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/solanapoet';

// Verify Google Sheets credentials are available
if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
  console.error('GOOGLE_SHEETS_CREDENTIALS environment variable is not set');
  process.exit(1);
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/collection', collectionRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/listing', listingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/sheets', sheetsRouter);  // Register the sheets router
app.use('/api/drive', driveRouter);

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
app.post('/check-seller', async (req: Request, res: Response) => {
  try {
    console.log('Check seller request received:', req.body);
    
    // Validate request parameters
    const { nftAddress, walletAddress } = req.body as CheckSellerRequest;
    
    if (!nftAddress || !walletAddress) {
      const response: CheckSellerResponse = {
        success: false,
        isOriginalSeller: false,
        message: 'Missing required parameters: nftAddress and walletAddress are required'
      };
      return res.status(400).json(response);
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
      return res.status(200).json(response);
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
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error checking seller:', error);
    const response: CheckSellerResponse = {
      success: false,
      isOriginalSeller: false,
      message: `Error checking seller: ${error instanceof Error ? error.message : String(error)}`
    };
    return res.status(500).json(response);
  }
});

// Start server with fallback ports if primary is in use
const startServer = (port: number | string) => {
  try {
    // Make sure port is a valid number and not too large
    let numericPort: number;
    if (typeof port === 'string') {
      numericPort = parseInt(port, 10);
    } else {
      numericPort = port;
    }
    
    // Check port range
    if (numericPort >= 65536) {
      console.error('Failed to start server: No available ports found in valid range');
      return;
    }
    
    console.log(`Attempting to start server on port ${numericPort}...`);
    
    const server = app.listen(numericPort, () => {
      console.log(`Server running on port ${numericPort}`);
      // Set an environment variable with the actual port
      process.env.ACTIVE_SERVER_PORT = numericPort.toString();
    });
    
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`Port ${numericPort} is already in use, trying port ${numericPort + 10}`);
        startServer(numericPort + 10);
      } else {
        console.error('Server error:', error);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

// Start the server with the configured port
startServer(PORT);

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    console.warn('Server running without MongoDB connection. Some features may not work.');
  });

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

export default app; 