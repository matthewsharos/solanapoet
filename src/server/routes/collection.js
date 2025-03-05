import express from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Collection model
// Note: We'll need to update this import once we convert the model to ES modules
import Collection from '../models/Collection.js';

dotenv.config();

const router = express.Router();

// Fallback in-memory collection storage when MongoDB is not available
let inMemoryCollections = [];

// Pinata credentials from environment variables
const PINATA_JWT = process.env.PINATA_JWT || '';
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

if (!PINATA_JWT) {
  console.warn('WARNING: PINATA_JWT environment variable is not set. File uploads to IPFS will fail.');
}

// Helper function to upload file to Pinata
const uploadFileToPinata = async (filePath, fileName) => {
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
router.post('/create', async (req, res) => {
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
    const imageFile = req.files.image;
    const fileName = `collection-${Date.now()}-${imageFile.name}`;
    const filePath = path.join(__dirname, '../uploads', fileName);
    
    await imageFile.mv(filePath);
    
    // Upload image to Pinata
    const imageHash = await uploadFileToPinata(filePath, fileName);
    const imageUrl = `${IPFS_GATEWAY}${imageHash}`;
    
    // Generate a unique ID for the collection
    const collectionId = uuidv4();
    
    // Create collection object
    const newCollectionData = {
      collectionId,
      name,
      description,
      symbol,
      imageUrl,
      creator,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      // Try to save to MongoDB
      const newCollection = new Collection(newCollectionData);
      await newCollection.save();
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      inMemoryCollections.push(newCollectionData);
    }
    
    // Remove temporary file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      collection: newCollectionData
    });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ success: false, message: 'Error creating collection' });
  }
});

// Endpoint to get all collections
router.get('/', async (_req, res) => {
  try {
    let collections = [];
    
    try {
      // Try to get from MongoDB
      collections = await Collection.find();
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      collections = inMemoryCollections;
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
router.get('/:collectionId', async (req, res) => {
  try {
    const { collectionId } = req.params;
    let collection = null;
    
    try {
      // Try to get from MongoDB
      collection = await Collection.findOne({ collectionId });
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      collection = inMemoryCollections.find(c => c.collectionId === collectionId);
    }
    
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
router.get('/creator/:creator', async (req, res) => {
  try {
    const { creator } = req.params;
    let collections = [];
    
    try {
      // Try to get from MongoDB
      collections = await Collection.find({ creator });
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      collections = inMemoryCollections.filter(c => c.creator === creator);
    }
    
    res.json({
      success: true,
      collections
    });
  } catch (error) {
    console.error('Error fetching collections by creator:', error);
    res.status(500).json({ success: false, message: 'Error fetching collections by creator' });
  }
});

// Endpoint to update a collection
router.put('/:collectionId', async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { name, description } = req.body;
    
    // Check if user is authorized
    const { creator } = req.body;
    
    if (creator !== AUTHORIZED_MINTER) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update collections' 
      });
    }
    
    let collection = null;
    let updatedCollection = null;
    
    try {
      // Try to update in MongoDB
      collection = await Collection.findOne({ collectionId });
      
      if (collection) {
        // Update fields
        if (name) collection.name = name;
        if (description) collection.description = description;
        collection.updatedAt = new Date().toISOString();
        
        await collection.save();
        updatedCollection = collection;
      }
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      const index = inMemoryCollections.findIndex(c => c.collectionId === collectionId);
      
      if (index !== -1) {
        if (name) inMemoryCollections[index].name = name;
        if (description) inMemoryCollections[index].description = description;
        inMemoryCollections[index].updatedAt = new Date().toISOString();
        
        updatedCollection = inMemoryCollections[index];
      }
    }
    
    if (!updatedCollection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    
    res.json({
      success: true,
      collection: updatedCollection
    });
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ success: false, message: 'Error updating collection' });
  }
});

// Endpoint to delete a collection
router.delete('/:collectionId', async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { creator } = req.body;
    
    if (creator !== AUTHORIZED_MINTER) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete collections' 
      });
    }
    
    let deleted = false;
    
    try {
      // Try to delete from MongoDB
      const result = await Collection.findOneAndDelete({ collectionId });
      deleted = !!result;
    } catch (dbError) {
      console.warn('MongoDB not available, using in-memory storage:', dbError.message);
      // Fallback to in-memory storage
      const initialLength = inMemoryCollections.length;
      inMemoryCollections = inMemoryCollections.filter(c => c.collectionId !== collectionId);
      deleted = initialLength > inMemoryCollections.length;
    }
    
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }
    
    res.json({
      success: true,
      message: 'Collection deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ success: false, message: 'Error deleting collection' });
  }
});

router.post('/search-ultimates', async (req, res) => {
  try {
    const { collectionId } = req.body;
    
    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    let page = 1;
    const ultimateNfts = [];
    
    while (true) {
      const response = await fetch('https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'my-id',
          method: 'getAssetsByGroup',
          params: {
            groupKey: 'collection',
            groupValue: collectionId,
            page: page,
            limit: 1000
          }
        })
      });

      const data = await response.json();
      const items = data.result.items;
      
      // Look for NFTs with ultimate rarity
      for (const nft of items) {
        const content = nft.content || {};
        const metadata = content.metadata || {};
        const attributes = metadata.attributes || [];
        
        for (const attr of attributes) {
          if (attr.trait_type === 'rarity' && 
              typeof attr.value === 'string' && 
              attr.value.toLowerCase() === 'ultimate') {
            ultimateNfts.push({
              id: nft.id,
              name: metadata.name,
              rarity: attr.value,
              image: content.files?.[0]?.uri || '',
              attributes: attributes
            });
          }
        }
      }
      
      // If we got less than 1000 items, we've reached the end
      if (items.length < 1000) {
        break;
      }
      
      page++;
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return res.json({ 
      ultimateNfts,
      total: ultimateNfts.length
    });
    
  } catch (error) {
    console.error('Error searching for ultimate NFTs:', error);
    return res.status(500).json({ error: 'Failed to search for ultimate NFTs' });
  }
});

export default router; 