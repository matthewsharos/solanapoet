import express, { Request, Response, Router, RequestHandler } from 'express';
import fileUpload, { UploadedFile, FileArray } from 'express-fileupload';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';
import NFT from '../models/NFT';
import Collection from '../models/Collection';
import { google } from 'googleapis';
import { getSheetValues } from '../sheets.js';

// Define interfaces for our responses and requests
interface HeliusResponse {
  result?: HeliusNFTData;
  data?: HeliusNFTData[];
}

interface HeliusNFTData {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  uri?: string;
  json?: any;
  content?: {
    $schema?: string;
    json?: any;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
      attributes?: Array<{
        trait_type: string;
        value: string;
      }>;
    };
    files?: Array<{
      uri: string;
      type: string;
    }>;
    links?: {
      image?: string;
      [key: string]: any;
    };
    attributes?: Array<{
      trait_type: string;
      value: string;
    }>;
  };
  [key: string]: any; // Allow for additional properties not explicitly defined
}

interface NFTCacheEntry {
  data: HeliusNFTData;
  timestamp: number;
  duration: number;
}

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface FileRequest extends Omit<Request, 'files'> {
  files?: {
    [key: string]: UploadedFile;
  } | null;
}

dotenv.config();

const router = Router();

// Configure file upload middleware
router.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  abortOnLimit: true
}));

// Environment variables
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'mainnet';
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';
const PINATA_JWT = process.env.PINATA_JWT || '';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
const GOOGLE_SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

if (!PINATA_JWT) {
  console.warn('WARNING: PINATA_JWT environment variable is not set. File uploads to IPFS will fail.');
}

if (!AUTHORIZED_MINTER) {
  console.warn('WARNING: AUTHORIZED_MINTER environment variable is not set. No wallet will be authorized to mint NFTs.');
}

// Add cache for NFT data
const NFT_CACHE = new Map<string, NFTCacheEntry>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const CACHE_DURATION_EXTENDED = 60 * 60 * 1000; // 1 hour for NFTs that rarely change
const CACHE_SIZE_LIMIT = 500; // Limit cache size to prevent memory issues

// Track cache hits and misses for analytics
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

// Helper function to get cached NFT data
const getCachedNFTData = (mintAddress: string): HeliusNFTData | null => {
  const cached = NFT_CACHE.get(mintAddress);
  if (cached && Date.now() - cached.timestamp < cached.duration) {
    cacheHits++;
    // Log cache hits for every 20 hits
    if (cacheHits % 20 === 0) {
      console.log(`[Helius Cache] Stats - Hits: ${cacheHits}, Misses: ${cacheMisses}, Evictions: ${cacheEvictions}, Size: ${NFT_CACHE.size}`);
    }
    return cached.data;
  }
  cacheMisses++;
  return null;
};

// Helper function to cache NFT data
const cacheNFTData = (mintAddress: string, data: HeliusNFTData): void => {
  // Use extended cache duration for NFTs with a creation date older than 30 days
  // because their metadata rarely changes
  const isOlderNFT = data.createdAt && (Date.now() - new Date(data.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000);
  const duration = isOlderNFT ? CACHE_DURATION_EXTENDED : CACHE_DURATION;
  
  // Implement LRU cache eviction if we exceed the size limit
  if (NFT_CACHE.size >= CACHE_SIZE_LIMIT) {
    // Find the oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of NFT_CACHE.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    // Evict the oldest entry
    if (oldestKey) {
      NFT_CACHE.delete(oldestKey);
      cacheEvictions++;
    }
  }
  
  NFT_CACHE.set(mintAddress, {
    data,
    timestamp: Date.now(),
    duration
  });
};

// Helper function to add delay between requests
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Helper function to fetch NFT data from Helius with retries
const fetchHeliusData = async (mintAddress: string, retries = 3): Promise<HeliusNFTData> => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('Helius API key not configured');
    }

    console.log(`[fetchHeliusData] Using API key (prefix: ${heliusApiKey.substring(0, 4)}...)`);

    // Create an axios instance with timeout
    const heliusClient = axios.create({
      timeout: 10000 // 10 second timeout
    });

    // First try the RPC API
    console.log(`[fetchHeliusData] Attempting RPC API for NFT: ${mintAddress}`);
    try {
      const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      console.log(`[fetchHeliusData] RPC endpoint: ${rpcEndpoint.substring(0, rpcEndpoint.indexOf('?'))}?...`);
      
      const rpcResponse = await heliusClient.post<HeliusResponse>(
        rpcEndpoint,
        {
          jsonrpc: "2.0",
          id: "helius-fetch",
          method: "getAsset",
          params: {
            id: mintAddress
          }
        }
      );
      
      console.log(`[fetchHeliusData] RPC API response status: ${rpcResponse.status}`);
      
      if (rpcResponse.data.result) {
        console.log(`[fetchHeliusData] RPC API success for ${mintAddress}`);
        return rpcResponse.data.result;
      } else {
        console.log(`[fetchHeliusData] RPC API returned no result for ${mintAddress}`);
      }
    } catch (error: any) {
      console.error(`[fetchHeliusData] RPC API error: ${error.message}`);
      if (error.response) {
        console.error(`[fetchHeliusData] RPC API response status: ${error.response.status}`);
        console.error(`[fetchHeliusData] RPC API response data: ${JSON.stringify(error.response.data)}`);
      }
    }

    // If RPC API fails, try the metadata API
    console.log(`[fetchHeliusData] Attempting metadata API for NFT: ${mintAddress}`);
    try {
      const metadataEndpoint = `https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`;
      console.log(`[fetchHeliusData] Metadata endpoint: ${metadataEndpoint.substring(0, metadataEndpoint.indexOf('?'))}?...`);
      
      const metadataResponse = await heliusClient.post<HeliusResponse>(
        metadataEndpoint,
        {
          mintAccounts: [mintAddress]
        }
      );

      console.log(`[fetchHeliusData] Metadata API response status: ${metadataResponse.status}`);
      
      if (metadataResponse.data.data && metadataResponse.data.data[0]) {
        console.log(`[fetchHeliusData] Metadata API success for ${mintAddress}`);
        return metadataResponse.data.data[0];
      } else {
        console.log(`[fetchHeliusData] Metadata API returned no data for ${mintAddress}`);
        throw new Error('No metadata found from metadata API');
      }
    } catch (error: any) {
      console.error(`[fetchHeliusData] Metadata API error: ${error.message}`);
      if (error.response) {
        console.error(`[fetchHeliusData] Metadata API response status: ${error.response.status}`);
        console.error(`[fetchHeliusData] Metadata API response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  } catch (error: any) {
    console.error(`[fetchHeliusData] Overall error for ${mintAddress}: ${error.message}`);
    
    if (retries > 0) {
      const delayTime = Math.pow(2, 3 - retries) * 1000; // Exponential backoff
      console.log(`[fetchHeliusData] Retrying in ${delayTime}ms (${retries} retries left)`);
      await delay(delayTime);
      return fetchHeliusData(mintAddress, retries - 1);
    }
    
    throw error;
  }
};

// Helper function to upload file to Pinata
const uploadFileToPinata = async (filePath: string, fileName: string): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    
    // Add metadata
    const metadata = JSON.stringify({
      name: fileName
    });
    formData.append('pinataMetadata', metadata);
    
    // Add options
    const options = JSON.stringify({
      cidVersion: 0
    });
    formData.append('pinataOptions', options);
    
    // Upload to Pinata
    const response = await axios.post<PinataResponse>(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Return the IPFS hash
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading file to Pinata:', error);
    throw new Error('Failed to upload file to IPFS');
  }
};

// Helper function to upload metadata to Pinata
const uploadMetadataToPinata = async (metadata: Record<string, unknown>): Promise<string> => {
  try {
    const response = await axios.post<PinataResponse>(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      metadata,
      {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading metadata to Pinata:', error);
    throw new Error('Failed to upload metadata to IPFS');
  }
};

// Endpoint to check if user is authorized to mint
router.get('/auth-check', (req: Request, res: Response) => {
  const { walletAddress } = req.query;
  
  if (!walletAddress) {
    res.status(400).json({ success: false, message: 'Wallet address is required' });
    return;
  }
  
  const isAuthorized = walletAddress === AUTHORIZED_MINTER;
  res.json({ success: true, isAuthorized });
});

// Endpoint to upload NFT image
const uploadImageHandler = async (req: FileRequest, res: Response): Promise<void> => {
  try {
    const imageFile = req.files?.image as UploadedFile | undefined;
    if (!imageFile) {
      res.status(400).json({ success: false, message: 'No image file was uploaded' });
      return;
    }

    // Instead of saving to disk, upload directly to Pinata
    try {
      const ipfsHash = await uploadBufferToPinata(imageFile.data, imageFile.name);
      const ipfsUrl = `${IPFS_GATEWAY}${ipfsHash}`;
      
      res.json({ 
        success: true, 
        fileName: imageFile.name,
        filePath: ipfsUrl,
        ipfsHash
      });
    } catch (pinataError) {
      console.error('Error uploading to Pinata:', pinataError);
      res.status(500).json({ success: false, message: 'Error uploading to IPFS' });
    }
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, message: 'Error uploading image' });
  }
};

// Helper function to upload buffer to Pinata
const uploadBufferToPinata = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName });
    
    // Add metadata
    const metadata = JSON.stringify({
      name: fileName
    });
    formData.append('pinataMetadata', metadata);
    
    // Add options
    const options = JSON.stringify({
      cidVersion: 0
    });
    formData.append('pinataOptions', options);
    
    // Upload to Pinata
    const response = await axios.post<PinataResponse>(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Return the IPFS hash
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading buffer to Pinata:', error);
    throw new Error('Failed to upload file to IPFS');
  }
};

const uploadHandler = async (req: FileRequest, res: Response): Promise<void> => {
  try {
    const imageFile = req.files?.image as UploadedFile | undefined;
    if (!imageFile) {
      res.status(400).json({ error: 'No image file was uploaded' });
      return;
    }

    // Check if user is authorized to mint
    const { walletAddress } = req.body;
    
    if (walletAddress !== AUTHORIZED_MINTER) {
      res.status(403).json({ 
        success: false, 
        message: 'Not authorized to mint NFTs' 
      });
      return;
    }
    
    // Get form data
    const { name, description, symbol, collectionId, attributes } = req.body;
    
    if (!name || !description || !symbol || !collectionId) {
      res.status(400).json({ 
        success: false, 
        message: 'Name, description, symbol, and collection ID are required' 
      });
      return;
    }
    
    // Parse attributes if they're provided as a string
    const parsedAttributes = attributes 
      ? (typeof attributes === 'string' ? JSON.parse(attributes) : attributes)
      : [];
    
    // Check if collection exists
    const collection = await Collection.findOne({ collectionId });
    
    if (!collection) {
      res.status(404).json({ 
        success: false, 
        message: 'Collection not found' 
      });
      return;
    }
    
    // Upload image buffer directly to Pinata instead of writing to disk
    const fileName = `${Date.now()}-${imageFile.name}`;
    
    // Upload image to Pinata
    const imageHash = await uploadBufferToPinata(imageFile.data, fileName);
    const imageUrl = `${IPFS_GATEWAY}${imageHash}`;
    
    // Create metadata
    const metadata = {
      name,
      symbol,
      description,
      image: imageUrl,
      attributes: parsedAttributes,
      properties: {
        files: [
          {
            uri: imageUrl,
            type: imageFile.mimetype
          }
        ],
        category: 'image',
        creators: [
          {
            address: walletAddress,
            share: 100
          }
        ]
      }
    };
    
    // Upload metadata to Pinata
    const metadataHash = await uploadMetadataToPinata(metadata);
    const metadataUrl = `${IPFS_GATEWAY}${metadataHash}`;
    
    // Generate a unique address for the NFT (in a real implementation, this would be the mint address)
    const address = uuidv4();
    
    // Create NFT in database
    const newNFT = new NFT({
      address,
      name,
      description,
      symbol,
      imageUrl,
      attributes: parsedAttributes,
      collectionId,
      owner: walletAddress,
      metadataUrl
    });
    
    await newNFT.save();
    
    res.json({
      success: true,
      nft: {
        address,
        name,
        description,
        symbol,
        imageUrl,
        metadataUrl,
        attributes: parsedAttributes,
        collectionId,
        owner: walletAddress
      }
    });
  } catch (error) {
    console.error('Error handling upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

router.post('/upload-image', uploadImageHandler as RequestHandler);
router.post('/upload', uploadHandler as RequestHandler);

router.post('/mint', (async (req: FileRequest, res: Response) => {
  try {
    if (!req.files) {
      res.status(400).json({ error: 'No files were uploaded' });
      return;
    }

    const files = req.files;
    if (!files.image) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }

    const imageFile = files.image;
    
    // ... rest of the code ...
  } catch (error) {
    console.error('Error minting NFT:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

// Endpoint to get all NFTs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const nfts = await NFT.find();
    
    res.json({
      success: true,
      nfts
    });
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    res.status(500).json({ success: false, message: 'Error fetching NFTs' });
  }
});

// Endpoint to get a specific NFT
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    const nft = await NFT.findOne({ address });
    
    if (!nft) {
      res.status(404).json({ success: false, message: 'NFT not found' });
      return;
    }
    
    res.json({
      success: true,
      nft
    });
  } catch (error) {
    console.error('Error fetching NFT:', error);
    res.status(500).json({ success: false, message: 'Error fetching NFT' });
  }
});

// Endpoint to get NFTs by collection
router.get('/collection/:collectionId', async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    
    const nfts = await NFT.find({ collectionId });
    
    res.json({
      success: true,
      nfts
    });
  } catch (error) {
    console.error('Error fetching NFTs by collection:', error);
    res.status(500).json({ success: false, message: 'Error fetching NFTs by collection' });
  }
});

// Endpoint to get NFTs by owner
router.get('/owner/:owner', async (req: Request, res: Response) => {
  try {
    const { owner } = req.params;
    
    const nfts = await NFT.find({ owner });
    
    res.json({
      success: true,
      nfts
    });
  } catch (error) {
    console.error('Error fetching NFTs by owner:', error);
    res.status(500).json({ success: false, message: 'Error fetching NFTs by owner' });
  }
});

// Endpoint to get NFT data by mint address from Helius
router.get('/helius/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    console.log(`[Helius API] Request received for NFT: ${mintAddress}`);
    console.log(`[Helius API] Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    
    // Debug environment variables
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    console.log(`[Helius API] API Key available: ${!!heliusApiKey}`);
    if (heliusApiKey) {
      console.log(`[Helius API] Key prefix: ${heliusApiKey.substring(0, 4)}... (length: ${heliusApiKey.length})`);
    }
    
    if (!heliusApiKey) {
      console.error('[Helius API] ERROR: API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Helius API key not configured',
        error: 'MISSING_API_KEY'
      });
    }

    // Check cache first
    const cachedData = getCachedNFTData(mintAddress);
    if (cachedData) {
      console.log('[Helius API] Returning cached data');
      return res.json({ success: true, nft: cachedData });
    }

    // Fetch from Helius API
    console.log('[Helius API] Fetching fresh data from Helius');
    let nftData = null;
    try {
      nftData = await fetchHeliusData(mintAddress);
      console.log('[Helius API] Successfully fetched data');
    } catch (error: any) {
      console.error('[Helius API] Error fetching from Helius:', error.message);
      const status = error.response?.status;
      const isServerError = status >= 500;
      const isRateLimit = status === 429;
      
      if (isServerError) {
        return res.status(503).json({ 
          success: false, 
          message: 'Helius API is temporarily unavailable',
          shouldRetry: true,
          retryAfter: 5000,
          error: 'HELIUS_SERVER_ERROR'
        });
      }
      
      if (isRateLimit) {
        return res.status(429).json({ 
          success: false, 
          message: 'Rate limit exceeded',
          shouldRetry: true,
          retryAfter: 2000,
          error: 'RATE_LIMIT_EXCEEDED'
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching NFT data',
        error: error.message || 'UNKNOWN_ERROR'
      });
    }

    if (!nftData) {
      console.error('[Helius API] No data returned for NFT:', mintAddress);
      return res.status(404).json({ 
        success: false, 
        message: 'NFT not found',
        error: 'NFT_NOT_FOUND'
      });
    }

    let ultimateData = null;
    let ownerDisplayName = null;
    try {
      // Get the ultimate NFT data and display names from Google Sheets
      if (GOOGLE_SHEETS_SPREADSHEET_ID) {
        // Get ultimate NFT data
        const ultimateSheetData = await getSheetValues(GOOGLE_SHEETS_SPREADSHEET_ID, 'ultimates');
        const ultimateValues = ultimateSheetData.values || [];
        const ultimateHeaders = ultimateValues[0];
        const nftRow = ultimateValues.find((row) => row[0] === mintAddress);
        if (nftRow) {
          ultimateData = {
            name: nftRow[ultimateHeaders.indexOf('Name')],
            owner: nftRow[ultimateHeaders.indexOf('Owner')],
            collection_id: nftRow[ultimateHeaders.indexOf('collection_id')]
          };
        }

        // Get owner's display name
        const displayNamesData = await getSheetValues(GOOGLE_SHEETS_SPREADSHEET_ID, 'display_names');
        const displayNamesValues = displayNamesData.values || [];
        const displayNamesHeaders = displayNamesValues[0];
        const ownerAddress = ultimateData?.owner || nftData.ownership?.owner;
        if (ownerAddress) {
          const ownerRow = displayNamesValues.find((row) => 
            row[displayNamesHeaders.indexOf('wallet_address')]?.toLowerCase() === ownerAddress.toLowerCase()
          );
          if (ownerRow) {
            ownerDisplayName = ownerRow[displayNamesHeaders.indexOf('display_name')];
          }
        }
      }
    } catch (sheetError) {
      console.warn('Failed to fetch Google Sheets data:', sheetError);
      // Continue without Google Sheets data
    }

    // Extract data from RPC API response
    const content = nftData.content || {};
    const metadata = content.metadata || {};
    const files = content.files || [];
    const ownership = nftData.ownership || {};
    const grouping = nftData.grouping || [];
    const collection = grouping.find((g: any) => g.group_key === 'collection')?.group_value;

    const ownerAddress = ultimateData?.owner || (ownership && 'owner' in ownership ? ownership.owner : '');

    const nftResponse: HeliusNFTData = {
      id: mintAddress,
      mint: mintAddress,
      content: {
        metadata: {
          name: metadata.name || ultimateData?.name || 'Unknown NFT',
          symbol: metadata.symbol || '',
          description: metadata.description || '',
          attributes: metadata.attributes || []
        },
        files,
        links: {
          image: files[0]?.uri || content.links?.image || ''
        }
      },
      metadata: {},
      owner: ownerAddress,
      ownership: {
        owner: ownerAddress,
        ...(ownership as Record<string, any>)
      },
      grouping: grouping || []
    };

    // Cache the response
    cacheNFTData(mintAddress, nftResponse);

    res.json({ success: true, nft: nftResponse });
  } catch (error) {
    console.error('Error in Helius endpoint:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Debug endpoint to check NFT image resolution
router.get('/debug/image/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    console.log('Debug image endpoint called for mint address:', mintAddress);
    
    if (!HELIUS_API_KEY) {
      console.error('Helius API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Helius API key not configured' 
      });
    }

    // Fetch NFT data from Helius
    try {
      const nftData = await fetchHeliusData(mintAddress);
      
      // Extract image URL
      const imageUrl = nftData.content?.files?.[0]?.uri || 
                      nftData.content?.links?.image || 
                      nftData.json?.image ||
                      '';
      
      // Check standard metadata fields
      const metadataImageUrl = nftData.content?.metadata?.image || '';
      
      // Check all possible image locations
      const possibleImageUrls = [
        imageUrl,
        metadataImageUrl,
        nftData.content?.files?.[0]?.uri,
        nftData.content?.links?.image,
        nftData.json?.image,
        nftData.content?.metadata?.image,
        nftData.image,
        // Add any other potential locations
      ].filter(url => !!url);
      
      // Check for image URLs in the raw JSON
      const rawJson = JSON.stringify(nftData);
      const imageUrlRegex = /(https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp))/g;
      const extractedUrls = [...new Set([...rawJson.matchAll(imageUrlRegex)].map(match => match[0]))];
      
      return res.json({
        success: true,
        mintAddress,
        primaryImageUrl: imageUrl,
        metadataImageUrl,
        possibleImageUrls,
        extractedUrls,
        nftData: {
          name: nftData.content?.metadata?.name || 'Unknown',
          symbol: nftData.content?.metadata?.symbol || '',
          description: nftData.content?.metadata?.description || '',
        },
        rawResponse: nftData
      });
    } catch (error: any) {
      console.error('Error fetching NFT data for debug:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching NFT data',
        error: error.message
      });
    }
  } catch (error: any) {
    console.error('Error in debug image endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add test endpoint for Helius API credentials
router.get('/test-helius', async (req: Request, res: Response) => {
  try {
    // Set a timeout of 8 seconds (to stay within Vercel's 10s limit)
    const TIMEOUT = 8000;
    
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL;

    if (!heliusApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Helius API key is not configured',
        config: { hasHeliusApiKey: false }
      });
    }

    // Create an axios instance with timeout
    const heliusClient = axios.create({
      timeout: TIMEOUT
    });

    // Test mint address (USDC mint address)
    const testMintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const response = await heliusClient.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: "2.0",
        id: "helius-test",
        method: "getAsset",
        params: {
          id: testMintAddress
        }
      }
    );

    return res.json({
      success: true,
      message: 'Helius API credentials are working',
      config: {
        hasHeliusApiKey: true,
        hasSolanaRpcUrl: !!solanaRpcUrl
      }
    });

  } catch (error: any) {
    // Handle specific error cases
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Request timed out while testing Helius API',
        error: 'TIMEOUT'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to test Helius API credentials',
      error: error.message,
      config: {
        hasHeliusApiKey: !!process.env.HELIUS_API_KEY || !!process.env.VITE_HELIUS_API_KEY,
        hasSolanaRpcUrl: !!process.env.SOLANA_RPC_URL || !!process.env.VITE_SOLANA_RPC_URL
      }
    });
  }
});

// Simple Helius test endpoint
router.get('/simple-test', async (_req: Request, res: Response) => {
  try {
    // Get API key from environment variables
    const apiKey = process.env.VITE_HELIUS_API_KEY;
    const rpcUrl = process.env.VITE_SOLANA_RPC_URL;
    
    // First, just check if we have the variables
    const envStatus = {
      hasViteHeliusKey: !!process.env.VITE_HELIUS_API_KEY,
      hasHeliusKey: !!process.env.HELIUS_API_KEY,
      hasViteRpcUrl: !!process.env.VITE_SOLANA_RPC_URL,
      hasRpcUrl: !!process.env.SOLANA_RPC_URL,
      viteHeliusKeyPrefix: apiKey ? apiKey.substring(0, 4) : null,
      viteRpcUrlPrefix: rpcUrl ? rpcUrl.substring(0, 30) : null
    };

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'No API key found',
        envVars: envStatus
      });
    }

    // Create an axios instance with a very short timeout
    const heliusClient = axios.create({
      timeout: 3000 // 3 second timeout
    });

    // Make a minimal request to Helius
    const response = await heliusClient.post(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        jsonrpc: '2.0',
        id: 'test',
        method: 'ping'
      }
    );

    return res.json({
      success: true,
      envVars: envStatus,
      heliusResponse: response.data
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      response: error.response?.data,
      config: {
        hasViteHeliusKey: !!process.env.VITE_HELIUS_API_KEY,
        hasHeliusKey: !!process.env.HELIUS_API_KEY,
        hasViteRpcUrl: !!process.env.VITE_SOLANA_RPC_URL,
        hasRpcUrl: !!process.env.SOLANA_RPC_URL
      }
    });
  }
});

// Minimal env var test endpoint
router.get('/env-check', (_req: Request, res: Response) => {
  const envVars = {
    hasViteHeliusKey: !!process.env.VITE_HELIUS_API_KEY,
    hasHeliusKey: !!process.env.HELIUS_API_KEY,
    hasViteRpcUrl: !!process.env.VITE_SOLANA_RPC_URL,
    hasRpcUrl: !!process.env.SOLANA_RPC_URL,
    viteHeliusKeyPrefix: process.env.VITE_HELIUS_API_KEY ? process.env.VITE_HELIUS_API_KEY.substring(0, 4) : null,
    viteRpcUrlPrefix: process.env.VITE_SOLANA_RPC_URL ? process.env.VITE_SOLANA_RPC_URL.substring(0, 30) : null,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV
  };

  return res.json({
    success: true,
    envVars
  });
});

export default router; 