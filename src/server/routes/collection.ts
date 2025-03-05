import express from 'express';
import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import Collection from '../models/Collection';

dotenv.config();

const router = express.Router();

// Pinata credentials from environment variables
const PINATA_JWT = process.env.PINATA_JWT || '';
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

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

// Endpoint to create a new collection
router.post('/create', async (req: Request, res: Response) => {
  try {
    // Check if user is authorized
    const { creator } = req.body;
    
    if (creator !== AUTHORIZED_MINTER) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to create collections' 
      });
    }
    
    // Check if image file is provided
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        success: false, 
        message: 'Collection image is required' 
      });
    }
    
    // Get form data
    const { name, description, symbol } = req.body;
    
    if (!name || !description || !symbol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, description, and symbol are required' 
      });
    }
    
    // Save image file temporarily
    const imageFile = req.files.image as any;
    const fileName = `collection-${Date.now()}-${imageFile.name}`;
    const filePath = path.join(__dirname, '../uploads', fileName);
    
    await imageFile.mv(filePath);
    
    // Upload image to Pinata
    const imageHash = await uploadFileToPinata(filePath, fileName);
    const imageUrl = `${IPFS_GATEWAY}${imageHash}`;
    
    // Generate a unique ID for the collection
    const collectionId = uuidv4();
    
    // Create collection in database
    const newCollection = new Collection({
      collectionId,
      name,
      description,
      symbol,
      imageUrl,
      creator
    });
    
    await newCollection.save();
    
    // Remove temporary file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      collection: {
        collectionId,
        name,
        description,
        symbol,
        imageUrl,
        creator
      }
    });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ success: false, message: 'Error creating collection' });
  }
});

// Endpoint to get all collections
router.get('/', async (_req: Request, res: Response) => {
  try {
    let collections = [];
    try {
      collections = await Collection.find();
    } catch (dbError) {
      console.warn('MongoDB error when fetching collections:', dbError);
      // Return mock data if MongoDB is not available
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
});

// Endpoint to get a specific collection
router.get('/:collectionId', async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    
    const collection = await Collection.findOne({ collectionId });
    
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    
    res.json({
      success: true,
      collection
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ success: false, message: 'Error fetching collection' });
  }
});

// Endpoint to get collections by creator
router.get('/creator/:creator', async (req: Request, res: Response) => {
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
});

export default router; 