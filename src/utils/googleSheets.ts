import { google } from 'googleapis';
import dotenv from 'dotenv';
import { JWT } from 'google-auth-library';
import { sheets_v4 } from '@googleapis/sheets';

dotenv.config();

// Google Sheets API configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const LISTINGS_SHEET_NAME = process.env.GOOGLE_SHEETS_LISTINGS_SHEET_NAME || 'Listings';

interface GoogleCredentials {
  client_email: string;
  private_key: string;
}

interface NFTListing {
  mint_id: string;
  list_date: string;
  list_price_sol: string;
  collection_id: string;
  seller_id: string;
}

// Authenticate with Google using service account credentials
async function getAuthClient(): Promise<JWT> {
  try {
    // First try using direct client email and private key from env variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Using credentials from GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
      
      return new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        undefined,
        process.env.GOOGLE_PRIVATE_KEY, // The private key already has newlines in the env var
        SCOPES
      );
    }
    
    // Next try using JSON credentials from env
    if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.log('Using credentials from GOOGLE_SHEETS_CREDENTIALS');
      const credentials: GoogleCredentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
      
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid Google Sheets credentials in GOOGLE_SHEETS_CREDENTIALS');
      }
      
      return new google.auth.JWT(
        credentials.client_email,
        undefined,
        credentials.private_key,
        SCOPES
      );
    }
    
    // Then try using credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Using credentials file from GOOGLE_APPLICATION_CREDENTIALS');
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: SCOPES,
      });
      return auth.getClient() as Promise<JWT>;
    }

    throw new Error('No Google credentials found. Set either GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_CREDENTIALS, or GOOGLE_APPLICATION_CREDENTIALS environment variables');
  } catch (error) {
    console.error('Error authenticating with Google:', error);
    throw error;
  }
}

// Initialize the sheets API
async function getSheetsAPI(): Promise<sheets_v4.Sheets> {
  const authClient = await getAuthClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Ensure the listings sheet exists, create it if not
async function ensureListingsSheetExists(): Promise<boolean> {
  try {
    const sheets = await getSheetsAPI();
    
    // Get existing sheets
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetExists = response.data.sheets?.some(
      sheet => sheet.properties?.title === LISTINGS_SHEET_NAME
    );
    
    if (!sheetExists) {
      // Create the sheet if it doesn't exist
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: LISTINGS_SHEET_NAME,
                },
              },
            },
          ],
        },
      });
      
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LISTINGS_SHEET_NAME}!A1:F1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['NFT Address', 'Seller Address', 'Price', 'Listing Date', 'Status', 'Seller_ID']],
        },
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring listings sheet exists:', error);
    throw error;
  }
}

// Record a new NFT listing
export async function recordNFTListing(
  nftAddress: string,
  sellerAddress: string,
  price: number | string,
  sellerId: string = sellerAddress,
  collection: string = '{}'
): Promise<boolean> {
  try {
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log('Using SheetBest API for recordNFTListing');
      
      // Format data for SheetBest API
      const newListing: NFTListing = {
        mint_id: nftAddress,
        list_date: new Date().toISOString(),
        list_price_sol: price.toString(),
        collection_id: collection,
        seller_id: sellerId
      };
      
      console.log('Creating listing with data:', JSON.stringify(newListing, null, 2));
      
      try {
        const response = await fetch(sheetBestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newListing),
        });
        
        if (!response.ok) {
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('SheetBest API response:', result);
        console.log(`Recorded NFT listing via SheetBest API: ${nftAddress} by ${sellerAddress} with Seller_ID: ${sellerId}`);
        return true;
      } catch (error) {
        console.error('Error using SheetBest API, falling back to Google Sheets API:', error);
      }
    }
    
    // Fall back to Google Sheets API
    await ensureListingsSheetExists();
    const sheets = await getSheetsAPI();
    
    // Get the next available row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A:A`,
    });
    
    const nextRow = (response.data.values?.length || 0) + 1;
    const listingDate = new Date().toISOString();
    
    // Add the new listing
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A${nextRow}:F${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[nftAddress, sellerAddress, price, listingDate, 'Active', sellerId]],
      },
    });
    
    console.log(`Recorded NFT listing in Google Sheets: ${nftAddress} by ${sellerAddress} with Seller_ID: ${sellerId}`);
    return true;
  } catch (error) {
    console.error('Error recording NFT listing:', error);
    return false;
  }
}

// Verify if the provided address is the original seller of the NFT
export async function verifySellerAddress(nftAddress: string, sellerAddress: string): Promise<boolean> {
  try {
    // Special handling for royalty receiver
    const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
    const isRoyaltyReceiver = sellerAddress === ROYALTY_RECEIVER_ADDRESS;
    
    if (isRoyaltyReceiver) {
      console.log(`⚠️ ROYALTY RECEIVER ${ROYALTY_RECEIVER_ADDRESS} is requesting seller verification for NFT ${nftAddress}`);
      console.log(`⚠️ ROYALTY RECEIVER OVERRIDE: Automatically verifying as seller for NFT ${nftAddress}`);
      return true;
    }
    
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log('Using SheetBest API for verifySellerAddress');
      try {
        const response = await fetch(sheetBestUrl);
        if (!response.ok) {
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} listings via SheetBest API`);
        
        // Find the entry with matching mint_id
        const matchingListing = data.find((listing: NFTListing) => listing.mint_id === nftAddress);
        
        if (matchingListing) {
          console.log('Found matching listing via SheetBest:', matchingListing);
          const sellerId = matchingListing.seller_id;
          
          const isVerified = sellerId === sellerAddress;
          
          console.log(`Seller verification for ${nftAddress}: ${isVerified ? 'Verified' : 'Failed'}`);
          console.log(`Seller_ID in sheet: ${sellerId}, Requesting seller: ${sellerAddress}`);
          
          return isVerified;
        } else {
          console.log(`No listing found for NFT: ${nftAddress} via SheetBest`);
        }
      } catch (error) {
        console.error('Error using SheetBest API, falling back to Google Sheets API:', error);
      }
    }
    
    // Fall back to Google Sheets API
    const sheets = await getSheetsAPI();
    
    // Search for the NFT in the listings
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A:F`,
    });
    
    const rows = response.data.values || [];
    
    // Skip header row
    const dataRows = rows.slice(1);
    
    // Find the row with the matching NFT address (mint address is in column A)
    const matchingListing = dataRows.find(row => row[0] === nftAddress);
    
    if (!matchingListing) {
      console.log(`NFT ${nftAddress} not found in spreadsheet`);
      return false;
    }
    
    // Check if the seller address matches (seller address is in column B)
    const storedSellerAddress = matchingListing[1];
    const storedSellerId = matchingListing[5] || storedSellerAddress;
    
    const isVerified = storedSellerId === sellerAddress;
    
    console.log(`Seller verification for ${nftAddress}: ${isVerified ? 'Verified' : 'Failed'}`);
    console.log(`Seller_ID in sheet: ${storedSellerId}, Requesting seller: ${sellerAddress}`);
    
    return isVerified;
  } catch (error) {
    console.error('Error verifying seller address:', error);
    return false;
  }
}

// Update the status of a listing
export async function updateListingStatus(nftAddress: string, status: string): Promise<boolean> {
  try {
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log('Using SheetBest API for updateListingStatus');
      try {
        const response = await fetch(sheetBestUrl);
        if (!response.ok) {
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} listings via SheetBest API`);
        
        // Find the entry with matching mint_id
        const matchingIndex = data.findIndex((listing: NFTListing) => listing.mint_id === nftAddress);
        
        if (matchingIndex !== -1) {
          console.log(`Found matching listing at index ${matchingIndex}`);
          
          // Update the status using PATCH request
          const updateResponse = await fetch(`${sheetBestUrl}/${matchingIndex + 1}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status }),
          });
          
          if (!updateResponse.ok) {
            throw new Error(`SheetBest API update returned ${updateResponse.status}: ${updateResponse.statusText}`);
          }
          
          console.log(`Updated listing status via SheetBest API: ${nftAddress} -> ${status}`);
          return true;
        } else {
          console.log(`No listing found for NFT: ${nftAddress} via SheetBest`);
        }
      } catch (error) {
        console.error('Error using SheetBest API, falling back to Google Sheets API:', error);
      }
    }
    
    // Fall back to Google Sheets API
    const sheets = await getSheetsAPI();
    
    // Search for the NFT in the listings
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A:E`,
    });
    
    const rows = response.data.values || [];
    
    // Skip header row
    const dataRows = rows.slice(1);
    
    // Find the row with the matching NFT address
    const rowIndex = dataRows.findIndex(row => row[0] === nftAddress);
    
    if (rowIndex === -1) {
      console.log(`NFT ${nftAddress} not found in spreadsheet`);
      return false;
    }
    
    // Update the status (status is in column E)
    const actualRow = rowIndex + 2; // Add 2 to account for 0-based index and header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!E${actualRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status]],
      },
    });
    
    console.log(`Updated listing status in Google Sheets: ${nftAddress} -> ${status}`);
    return true;
  } catch (error) {
    console.error('Error updating listing status:', error);
    return false;
  }
}

// Get the seller address for a given NFT
export async function getSellerAddress(nftAddress: string): Promise<string | null> {
  try {
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log('Using SheetBest API for getSellerAddress');
      try {
        const response = await fetch(sheetBestUrl);
        if (!response.ok) {
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} listings via SheetBest API`);
        
        // Find the entry with matching mint_id
        const matchingListing = data.find((listing: NFTListing) => listing.mint_id === nftAddress);
        
        if (matchingListing) {
          console.log('Found matching listing via SheetBest:', matchingListing);
          return matchingListing.seller_id;
        } else {
          console.log(`No listing found for NFT: ${nftAddress} via SheetBest`);
        }
      } catch (error) {
        console.error('Error using SheetBest API, falling back to Google Sheets API:', error);
      }
    }
    
    // Fall back to Google Sheets API
    const sheets = await getSheetsAPI();
    
    // Search for the NFT in the listings
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A:F`,
    });
    
    const rows = response.data.values || [];
    
    // Skip header row
    const dataRows = rows.slice(1);
    
    // Find the row with the matching NFT address
    const matchingListing = dataRows.find(row => row[0] === nftAddress);
    
    if (!matchingListing) {
      console.log(`NFT ${nftAddress} not found in spreadsheet`);
      return null;
    }
    
    // Return the seller ID (column F) if available, otherwise return seller address (column B)
    const sellerId = matchingListing[5];
    const sellerAddress = matchingListing[1];
    
    return sellerId || sellerAddress;
  } catch (error) {
    console.error('Error getting seller address:', error);
    return null;
  }
} 