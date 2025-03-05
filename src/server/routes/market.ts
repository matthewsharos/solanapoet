import express, { RequestHandler } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const SHEET_BEST_API_URL = 'https://api.sheetbest.com/sheets/3c05631c-0279-4e0b-b101-e0701e19a8f3';

// Helper function to get all listings from sheet.best
const getAllListings = async (): Promise<any[]> => {
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
const getListingsByAddressesHandler: RequestHandler = async (req, res, next): Promise<void> => {
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
    const filteredListings: Record<string, any> = {};
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
  } catch (error: unknown) {
    console.error('Error in getListingsByAddressesHandler:', error);
    next(error);
  }
};

// Register only the necessary routes
router.post('/listings', getListingsByAddressesHandler);

export default router; 