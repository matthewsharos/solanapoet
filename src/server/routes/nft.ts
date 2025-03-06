import express from 'express';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { UploadedFile } from 'express-fileupload';
import axios from 'axios';
import FormData from 'form-data';
import NFT from '../models/NFT';
import Collection from '../models/Collection';
import { google } from 'googleapis';
import { getSheetValues } from '../sheets';

dotenv.config();

const router = express.Router();

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
const NFT_CACHE = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Helper function to get cached NFT data
const getCachedNFTData = (mintAddress: string) => {
  const cached = NFT_CACHE.get(mintAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

// Helper function to cache NFT data
const cacheNFTData = (mintAddress: string, data: any) => {
  NFT_CACHE.set(mintAddress, {
    data,
    timestamp: Date.now()
  });
};

// Helper function to fetch NFT data from Helius with retries
const fetchHeliusData = async (mintAddress: string, retries = 3): Promise<any> => {
  try {
    // First try the RPC API
    const rpcResponse = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      jsonrpc: "2.0",
      id: "my-id",
      method: "getAsset",
      params: {
        id: mintAddress
      }
    });
    
    if (rpcResponse.data.result) {
      return rpcResponse.data.result;
    }

    // If RPC API returns no data, try the metadata API
    const metadataResponse = await axios.post(`https://api.helius.xyz/v0/tokens/metadata?api-key=${HELIUS_API_KEY}`, {
      mintAccounts: [mintAddress]
    });

    return metadataResponse.data[0];
  } catch (error: any) {
    if (retries > 0) {
      const delay = Math.min(2000 * Math.pow(2, 3 - retries), 8000);
      console.log(`Retrying Helius API fetch for ${mintAddress}, ${retries} attempts remaining. Waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
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
    const response = await axios.post(
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
const uploadMetadataToPinata = async (metadata: any): Promise<string> => {
  try {
    const response = await axios.post(
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
router.post('/upload-image', async (req: Request, res: Response) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      res.status(400).json({ success: false, message: 'No files were uploaded' });
      return;
    }

    const image = req.files.image as UploadedFile;
    const uploadDir = path.join(__dirname, '../../../uploads');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const fileName = `${uuidv4()}${path.extname(image.name)}`;
    const filePath = path.join(uploadDir, fileName);
    
    // Move the file to the uploads directory
    await image.mv(filePath);
    
    res.json({ 
      success: true, 
      fileName,
      filePath: `/uploads/${fileName}` 
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, message: 'Error uploading image' });
  }
});

// Endpoint to mint a new NFT
router.post('/mint', async (req: Request, res: Response) => {
  try {
    // Check if user is authorized to mint
    const { walletAddress } = req.body;
    
    if (walletAddress !== AUTHORIZED_MINTER) {
      res.status(403).json({ 
        success: false, 
        message: 'Not authorized to mint NFTs' 
      });
      return;
    }
    
    // Check if image file is provided
    if (!req.files || !req.files.image) {
      res.status(400).json({ 
        success: false, 
        message: 'Image file is required' 
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
    let parsedAttributes = [];
    if (attributes) {
      parsedAttributes = typeof attributes === 'string' 
        ? JSON.parse(attributes) 
        : attributes;
    }
    
    // Check if collection exists
    const collection = await Collection.findOne({ collectionId });
    
    if (!collection) {
      res.status(404).json({ 
        success: false, 
        message: 'Collection not found' 
      });
      return;
    }
    
    // Save image file temporarily
    const imageFile = req.files.image as any;
    const fileName = `${Date.now()}-${imageFile.name}`;
    const filePath = path.join(__dirname, '../uploads', fileName);
    
    await imageFile.mv(filePath);
    
    // Upload image to Pinata
    const imageHash = await uploadFileToPinata(filePath, fileName);
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
    
    // Remove temporary file
    fs.unlinkSync(filePath);
    
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
    console.error('Error minting NFT:', error);
    res.status(500).json({ success: false, message: 'Error minting NFT' });
  }
});

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
    console.log('Helius endpoint called for mint address:', mintAddress);
    
    if (!HELIUS_API_KEY) {
      console.error('Helius API key not configured');
      res.status(500).json({ success: false, message: 'Helius API key not configured' });
      return;
    }
    console.log('Using Helius API key:', HELIUS_API_KEY);

    // Check cache first
    const cachedData = getCachedNFTData(mintAddress);
    if (cachedData) {
      console.log('Returning cached data for mint:', mintAddress);
      res.json({ success: true, nft: cachedData });
      return;
    }

    let nftData = null;
    try {
      console.log('Fetching NFT data from Helius for mint:', mintAddress);
      nftData = await fetchHeliusData(mintAddress);
      console.log('Helius response:', JSON.stringify(nftData, null, 2));
    } catch (error: any) {
      console.error('Error fetching from Helius:', error);
      const status = error.response?.status;
      const isServerError = status >= 500;
      const isRateLimit = status === 429;
      
      if (isServerError) {
        res.status(503).json({ 
          success: false, 
          message: 'Helius API is temporarily unavailable',
          shouldRetry: true,
          retryAfter: 5000
        });
        return;
      }
      
      if (isRateLimit) {
        res.status(429).json({ 
          success: false, 
          message: 'Rate limit exceeded',
          shouldRetry: true,
          retryAfter: 2000
        });
        return;
      }
      
      res.status(500).json({ success: false, message: 'Error fetching NFT data' });
      return;
    }

    if (!nftData) {
      res.status(404).json({ success: false, message: 'NFT not found' });
      return;
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

    const nftResponse = {
      mint: mintAddress,
      name: metadata.name || ultimateData?.name || 'Unknown NFT',
      symbol: metadata.symbol,
      description: metadata.description,
      image: files[0]?.uri || content.links?.image || '',
      attributes: metadata.attributes,
      owner: {
        publicKey: ultimateData?.owner || ownership.owner,
        displayName: ownerDisplayName
      },
      collection: ultimateData?.collection_id || collection
    };

    // Cache the response
    cacheNFTData(mintAddress, nftResponse);

    res.json({ success: true, nft: nftResponse });
  } catch (error) {
    console.error('Error in Helius endpoint:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router; 