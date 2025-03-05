import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const SHEET_BEST_API_URL = 'https://api.sheetbest.com/sheets/3c05631c-0279-4e0b-b101-e0701e19a8f3';

// Helper function to get all listings from sheet.best
const getAllListings = async () => {
  try {
    console.log('Fetching listings from sheet.best:', SHEET_BEST_API_URL);
    const response = await fetch(SHEET_BEST_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch listings: ${response.statusText}`);
    }
    const data = await response.json();
    console.log(`Fetched ${Array.isArray(data) ? data.length : 0} listings from sheet.best`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching listings:', error);
    return [];
  }
};

// Get listings by NFT addresses (POST endpoint)
const getListingsByAddressesHandler = async (req, res, next) => {
  try {
    console.log('Received request for listings with body:', req.body);
    const { nftAddresses } = req.body;
    
    // Get all listings from sheet.best
    const allListings = await getAllListings();
    
    if (!nftAddresses || !Array.isArray(nftAddresses)) {
      // If no NFT addresses provided or invalid format, return all listings
      console.log('No NFT addresses provided, returning all listings');
      res.json(allListings);
      return;
    }
    
    console.log(`Filtering listings for ${nftAddresses.length} NFT addresses`);
    
    // Filter listings for the requested NFTs
    const filteredListings = {};
    nftAddresses.forEach(address => {
      const listing = allListings.find(l => l.mint_id === address);
      if (listing) {
        filteredListings[address] = {
          seller_address: listing.seller_id,
          price: parseFloat(listing.list_price_sol),
          list_date: listing.list_date
        };
      }
    });
    
    console.log(`Found ${Object.keys(filteredListings).length} matching listings`);
    res.json(filteredListings);
  } catch (error) {
    console.error('Error in getListingsByAddressesHandler:', error);
    next(error);
  }
};

// Register only the necessary routes
router.post('/listings', getListingsByAddressesHandler);

// Add the check-seller endpoint
router.post('/check-seller', async (req, res) => {
  try {
    console.log('Check seller request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, walletAddress } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- walletAddress: ${walletAddress} ${typeof walletAddress}`);
    
    if (!nftAddress || !walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and walletAddress are required' 
      });
    }
    
    // Import the verifySellerAddress function
    const { verifySellerAddress } = await import('../../utils/googleSheets.js');
    
    // Verify that the wallet is the original seller
    const isOriginalSeller = await verifySellerAddress(nftAddress, walletAddress);
    
    res.status(200).json({
      success: true,
      isOriginalSeller: isOriginalSeller
    });
    
  } catch (error) {
    console.error('Error checking seller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking seller', 
      error: error.message 
    });
  }
});

export default router; 