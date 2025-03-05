import { NFT } from '../types/nft';
import { getApiBaseUrl } from './marketplace';
import { google } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG, createSheetsClient } from './googleSheetsConfig';

// Configuration 
// TODO: Replace this with your actual sheet.best API URL from your connection
export const GOOGLE_SHEETS_API_URL = 'https://api.sheetbest.com/sheets/3c05631c-0279-4e0b-b101-e0701e19a8f3';

// Add fallback to localStorage if Google Sheets is not available
export const useLocalStorage = !GOOGLE_SHEETS_API_URL || GOOGLE_SHEETS_API_URL.includes('YOUR_SHEET_BEST_API_URL');

// Timeout and retry configuration
const SETUP_TIMEOUT = 15000; // 15 seconds
const MAX_SETUP_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Simple validation to ensure we have proper NFT data
const isValidNFT = (nft: any): boolean => {
  return (
    nft && 
    typeof nft.mint === 'string' && 
    nft.mint.length > 0
  );
};

// Initialize the connection to Google Sheets
export const setupGoogleSheets = async (retries = MAX_SETUP_RETRIES): Promise<boolean> => {
  try {
    const sheetsClient = await createSheetsClient();
    
    // Test connection by trying to read the spreadsheet
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.listings}!A1:A1`
    });

    if (!response.data) {
      throw new Error('Failed to connect to Google Sheets API');
    }

    console.log('Successfully connected to Google Sheets API');
    return true;
  } catch (error) {
    console.error('Failed to initialize Google Sheets:', error);
    
    if (retries > 0) {
      console.log(`Retrying setup, ${retries} attempts remaining...`);
      await sleep(RETRY_DELAY);
      return setupGoogleSheets(retries - 1);
    }

    // Fall back to localStorage
    console.log('Falling back to localStorage for NFT listings');
    if (!localStorage.getItem('nft_listings')) {
      localStorage.setItem('nft_listings', JSON.stringify({}));
    }
    return true;
  }
};

// Get current listings from Google Sheets or localStorage
const getListings = async (): Promise<any[]> => {
  try {
    // If using localStorage fallback
    if (useLocalStorage) {
      const storedListings = localStorage.getItem('nft_listings');
      if (!storedListings) return [];
      
      const listings = JSON.parse(storedListings);
      const activeListings = Object.entries(listings).map(([mint, listing]: [string, any]) => ({
        mint_id: mint,
        list_date: new Date(listing.timestamp).toISOString(),
        list_price_sol: listing.price.toString(),
        collection_id: listing.collection || ''
      }));
      
      return activeListings;
    }

    // Otherwise use Google Sheets API
    const response = await fetch(`${GOOGLE_SHEETS_API_URL}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch listings: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Return all listings as they don't have an active flag
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching listings:', error);
    return [];
  }
};

// List an NFT for sale by adding it to Google Sheets or localStorage
export const listNFTForSale = async (
  nft: NFT, 
  price: number, 
  sellerAddress: string
): Promise<boolean> => {
  if (!isValidNFT(nft)) {
    console.error('Invalid NFT data provided for listing');
    return false;
  }

  try {
    // If using localStorage fallback
    if (useLocalStorage) {
      const storedListings = localStorage.getItem('nft_listings') || '{}';
      const listings = JSON.parse(storedListings);
      
      listings[nft.mint] = {
        name: nft.name,
        price,
        sellerAddress,
        timestamp: Date.now(),
        collection: nft.collection || ''
      };
      
      localStorage.setItem('nft_listings', JSON.stringify(listings));
      console.log(`NFT ${nft.mint} listed for ${price} SOL (localStorage)`);
      return true;
    }

    // Create a new row for the listing using the sheet's column structure
    const newListing = {
      mint_id: nft.mint,
      list_date: new Date().toISOString(),
      list_price_sol: price.toString(),
      collection_id: JSON.stringify(nft.collection) || '',
      seller_id: sellerAddress
    };

    console.log('Creating listing with data:', JSON.stringify(newListing, null, 2));

    // Add to Google Sheets via API
    const response = await fetch(GOOGLE_SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newListing),
    });

    if (!response.ok) {
      throw new Error(`Failed to list NFT: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error listing NFT:', error);
    return false;
  }
};

// Unlist an NFT by removing it from Google Sheets or localStorage
export const unlistNFT = async (
  nft: NFT, 
  sellerAddress: string
): Promise<boolean> => {
  if (!isValidNFT(nft)) {
    console.error('Invalid NFT data provided for unlisting');
    return false;
  }

  try {
    // If using localStorage fallback
    if (useLocalStorage) {
      const storedListingsJson = localStorage.getItem('nft_listings');
      if (!storedListingsJson) return false;
      
      const listings = JSON.parse(storedListingsJson);
      
      if (listings[nft.mint] && listings[nft.mint].sellerAddress === sellerAddress) {
        delete listings[nft.mint];
        localStorage.setItem('nft_listings', JSON.stringify(listings));
        console.log(`NFT ${nft.mint} unlisted successfully (localStorage)`);
        return true;
      } else {
        console.warn(`NFT ${nft.mint} not found or not owned by ${sellerAddress}`);
        return false;
      }
    }

    // First, get all listings from Google Sheets
    const listings = await getListings();
    
    // Find the listing for this NFT
    const nftListing = listings.find(listing => listing.mint_id === nft.mint);

    if (!nftListing) {
      console.error(`No listing found for NFT ${nft.mint}`);
      return false;
    }

    // For unlisting in this implementation, we need to DELETE the row
    // We'll make a request to the specific row using its index
    const listingIndex = listings.indexOf(nftListing);
    if (listingIndex === -1) {
      console.error(`Could not determine index for NFT listing ${nft.mint}`);
      return false;
    }

    // Delete the row using sheet.best API (adding /index to the URL)
    const response = await fetch(`${GOOGLE_SHEETS_API_URL}/${listingIndex}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to unlist NFT: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error unlisting NFT:', error);
    return false;
  }
};

// Purchase an NFT by removing it from listings and recording the transaction
export const purchaseNFT = async (
  nftMintAddress: string,
  buyerAddress: string,
  price: number
): Promise<boolean> => {
  try {
    // Get the base URL dynamically
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nftAddress: nftMintAddress,
        buyerAddress,
        price,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Server-side purchase result:', result);
    
    if (result.success) {
      console.log(`NFT ${nftMintAddress} purchased successfully through server!`);
      return true;
    } else {
      throw new Error(result.message || 'Purchase failed on server');
    }
  } catch (error) {
    console.error('Error purchasing NFT:', error);
    return false;
  }
};

// Check if an NFT is on the default auction house
export const isOnDefaultAuctionHouse = async (nft: NFT): Promise<boolean> => {
  // The concept of "default auction house" doesn't apply in our simplified implementation
  // We're just checking if it's listed at all
  try {
    if (!isValidNFT(nft)) {
      return false;
    }
    
    // If using localStorage fallback
    if (useLocalStorage) {
      const storedListingsJson = localStorage.getItem('nft_listings');
      if (!storedListingsJson) return false;
      
      const listings = JSON.parse(storedListingsJson);
      return !!listings[nft.mint];
    }
    
    // Otherwise use Google Sheets
    const listings = await getListings();
    return listings.some(listing => listing.mint_id === nft.mint);
  } catch (error) {
    console.error('Error checking if NFT is on default auction house:', error);
    return false;
  }
};

// Function to fetch listing data for a collection of NFTs
export const fetchGoogleSheetsListingData = async <T extends { mint: string }>(
  nfts: T[]
): Promise<(T & { price: number | null; listed: boolean })[]> => {
  if (!nfts || nfts.length === 0) {
    return [];
  }

  try {
    // If using localStorage fallback
    if (useLocalStorage) {
      const storedListingsJson = localStorage.getItem('nft_listings');
      if (!storedListingsJson) {
        return nfts.map(nft => ({ ...nft, price: null, listed: false }));
      }
      
      const listings = JSON.parse(storedListingsJson);
      
      return nfts.map(nft => {
        const listing = listings[nft.mint];
        return {
          ...nft,
          price: listing ? listing.price : null,
          listed: !!listing
        };
      });
    }
    
    // Otherwise use Google Sheets
    // Get all listings
    const listings = await getListings();
    
    // Create a map for quick lookup
    const listingMap = new Map();
    listings.forEach(listing => {
      listingMap.set(listing.mint_id, {
        price: parseFloat(listing.list_price_sol),
        listed: true
      });
    });

    // Update each NFT with listing information
    return nfts.map(nft => {
      const listingInfo = listingMap.get(nft.mint);
      return {
        ...nft,
        price: listingInfo ? listingInfo.price : null,
        listed: !!listingInfo
      };
    });
  } catch (error) {
    console.error('Error fetching Google Sheets listing data:', error);
    // Return NFTs with no listing data on error
    return nfts.map(nft => ({ ...nft, price: null, listed: false }));
  }
}; 