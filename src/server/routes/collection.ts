import express, { Router, Request, Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import Collection from '../models/Collection';
import os from 'os';

dotenv.config();

const router = Router();

// Configure multer for file uploads - using memory storage for Vercel compatibility
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      const error: any = new Error('Only image files are allowed!');
      return cb(error, false);
    }
    cb(null, true);
  }
});

// Pinata credentials from environment variables
const PINATA_JWT = process.env.PINATA_JWT || '';
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

// Helper function to upload buffer to Pinata
const uploadBufferToPinata = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName });
    
    const metadata = JSON.stringify({
      name: fileName
    });
    formData.append('pinataMetadata', metadata);
    
    const options = JSON.stringify({
      cidVersion: 0
    });
    formData.append('pinataOptions', options);
    
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
    
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading to Pinata:', error);
    throw new Error('Failed to upload file to IPFS');
  }
};

// Define types for request handlers
interface CreateCollectionRequest extends Request {
  file?: Express.Multer.File;
  body: {
    name: string;
    description: string;
    symbol: string;
    ultimates?: string | boolean;
  };
}

interface GetCollectionRequest extends Request {
  params: {
    collectionId: string;
  };
}

interface GetCollectionsByCreatorRequest extends Request {
  params: {
    creator: string;
  };
}

// Endpoint to create a new collection
const createCollection = async (req: CreateCollectionRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }

    const { name, description, symbol, ultimates } = req.body;
    
    if (!name || !description || !symbol) {
      throw new Error('Missing required fields');
    }

    // Upload image buffer to IPFS via Pinata
    const ipfsHash = await uploadBufferToPinata(req.file.buffer, req.file.originalname);
    const imageUrl = `${IPFS_GATEWAY}${ipfsHash}`;

    // Create new collection
    const collectionId = uuidv4();
    const newCollection = new Collection({
      collectionId,
      name,
      description,
      symbol,
      imageUrl,
      creator: AUTHORIZED_MINTER,
      ultimates: ultimates === 'true' || ultimates === true
    });

    await newCollection.save();
    
    res.status(201).json({
      success: true,
      collection: newCollection
    });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create collection'
    });
  }
};

router.post('/create', upload.single('image'), createCollection);

// Endpoint to get all collections
const getAllCollections = async (_req: Request, res: Response): Promise<void> => {
  try {
    let collections = [];
    try {
      collections = await Collection.find();
    } catch (dbError) {
      console.warn('MongoDB error when fetching collections:', dbError);
      collections = [
        {
          collectionId: 'mock-collection-1',
          name: 'Sample Collection',
          description: 'This is a sample collection for testing',
          symbol: 'SAMPLE',
          imageUrl: 'https://via.placeholder.com/300',
          creator: AUTHORIZED_MINTER
        }
      ];
    }
    
    res.json({
      success: true,
      collections
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ success: false, message: 'Error fetching collections' });
  }
};

router.get('/', getAllCollections);

// Endpoint to get a specific collection
const getCollection = async (req: GetCollectionRequest, res: Response): Promise<void> => {
  try {
    const { collectionId } = req.params;
    
    const collection = await Collection.findOne({ collectionId });
    
    if (!collection) {
      res.status(404).json({ success: false, message: 'Collection not found' });
      return;
    }
    
    res.json({
      success: true,
      collection
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ success: false, message: 'Error fetching collection' });
  }
};

router.get('/:collectionId', getCollection);

// Endpoint to get collections by creator
const getCollectionsByCreator = async (req: GetCollectionsByCreatorRequest, res: Response): Promise<void> => {
  try {
    const { creator } = req.params;
    
    const collections = await Collection.find({ creator });
    
    res.json({
      success: true,
      collections
    });
  } catch (error) {
    console.error('Error fetching collections by creator:', error);
    res.status(500).json({ success: false, message: 'Error fetching collections by creator' });
  }
};

router.get('/creator/:creator', getCollectionsByCreator);

export default router; 