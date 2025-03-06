import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Google Sheets API configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const LISTINGS_SHEET_NAME = process.env.GOOGLE_SHEETS_LISTINGS_SHEET_NAME || 'Listings';

// Authenticate with Google using service account credentials
async function getAuthClient() {
  try {
    // First try using direct credentials from env
    if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.log('Using credentials from GOOGLE_SHEETS_CREDENTIALS');
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
      
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid Google Sheets credentials in GOOGLE_SHEETS_CREDENTIALS');
      }
      
      return new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        SCOPES
      );
    }
    
    // Then try using credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Using credentials file from GOOGLE_APPLICATION_CREDENTIALS');
      return new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: SCOPES,
      }).getClient();
    }

    throw new Error('Neither GOOGLE_SHEETS_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS environment variable is set');
  } catch (error) {
    console.error('Error authenticating with Google:', error);
    throw error;
  }
}

// Initialize the sheets API
async function getSheetsAPI() {
  const authClient = await getAuthClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Ensure the listings sheet exists, create it if not
async function ensureListingsSheetExists() {
  try {
    const sheets = await getSheetsAPI();
    
    // Get existing sheets
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetExists = response.data.sheets.some(
      sheet => sheet.properties.title === LISTINGS_SHEET_NAME
    );
    
    if (!sheetExists) {
      // Create the sheet if it doesn't exist
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
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
        resource: {
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
export async function recordNFTListing(nftAddress, sellerAddress, price, sellerId = sellerAddress, collection = '{}') {
  try {
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log('Using SheetBest API for recordNFTListing');
      
      // Format data for SheetBest API
      const newListing = {
        mint_id: nftAddress,
        list_date: new Date().toISOString(),
        list_price_sol: price.toString(),
        collection_id: collection || '{}',  // Use provided collection data
        seller_id: sellerId   // Ensure seller_id is recorded
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
      resource: {
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
export async function verifySellerAddress(nftAddress, sellerAddress) {
  try {
    // Special handling for royalty receiver
    const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
    const isRoyaltyReceiver = sellerAddress === ROYALTY_RECEIVER_ADDRESS;
    
    if (isRoyaltyReceiver) {
      console.log(`⚠️ ROYALTY RECEIVER ${ROYALTY_RECEIVER_ADDRESS} is requesting seller verification for NFT ${nftAddress}`);
      // Special case: always verify royalty receiver as the seller for any NFT
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
        const matchingListing = data.find(listing => listing.mint_id === nftAddress);
        
        if (matchingListing) {
          console.log('Found matching listing via SheetBest:', matchingListing);
          const sellerId = matchingListing.seller_id;
          const status = matchingListing.status;
          
          // Check if the NFT is already sold, the seller should not be able to unlist it
          if (status === 'Sold') {
            console.log(`NFT ${nftAddress} is already sold, seller cannot unlist`);
            return false;
          }
          
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
      range: `${LISTINGS_SHEET_NAME}!A:F`,  // Include the status column
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
    
    // Get the seller_id from column B
    const sellerId = matchingListing[1];
    const status = matchingListing[5]; // Get status if available
    
    // If the NFT is already sold, the seller should not be able to unlist it
    if (status === 'Sold') {
      console.log(`NFT ${nftAddress} is already sold, seller cannot unlist`);
      return false;
    }
   
    // Check if the provided address matches the seller_id
    const isVerified = sellerId === sellerAddress;
    
    console.log(`Seller verification for ${nftAddress}: ${isVerified ? 'Verified' : 'Failed'}`);
    console.log(`Seller_ID in sheet: ${sellerId}, Requesting seller: ${sellerAddress}`);
    
    return isVerified;
  } catch (error) {
    console.error('Error verifying seller address:', error);
    return false;
  }
}

// Update the status of an NFT listing (e.g., to 'Unlisted' or 'Sold')
export async function updateListingStatus(nftAddress, status) {
  try {
    console.log(`updateListingStatus called for NFT: ${nftAddress} with status: ${status}`);
    
    // First, try to use the SheetBest API if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    
    if (sheetBestUrl) {
      console.log(`Using SheetBest API for updateListingStatus: ${sheetBestUrl}`);
      try {
        // Get all listings
        const response = await fetch(sheetBestUrl);
        if (!response.ok) {
          console.error(`SheetBest API returned ${response.status}: ${response.statusText}`);
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} listings via SheetBest API`);
        
        // Find the entry with matching mint_id
        const listingIndex = data.findIndex(listing => listing.mint_id === nftAddress);
        
        if (listingIndex === -1) {
          console.log(`No listing found for NFT: ${nftAddress} via SheetBest`);
          return false;
        }
        
        console.log(`Found listing at index ${listingIndex}:`, data[listingIndex]);
        
        // If unlisting or sold, delete the row
        if (status === 'Unlisted' || status === 'Sold') {
          console.log(`Deleting row for NFT: ${nftAddress} with status: ${status}`);
          
          const deleteResponse = await fetch(`${sheetBestUrl}/${listingIndex}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (!deleteResponse.ok) {
            console.error(`Failed to delete listing: ${deleteResponse.status} - ${deleteResponse.statusText}`);
            throw new Error(`Failed to delete listing: ${deleteResponse.statusText}`);
          }
          
          console.log(`Successfully deleted row for NFT: ${nftAddress}`);
          return true;
        }
        
        // For other statuses, update the status
        console.log(`Updating status for NFT: ${nftAddress} to ${status}`);
        
        // Create an updated listing object
        const updatedListing = {
          ...data[listingIndex],
          status: status
        };
        
        console.log(`Updated listing data:`, updatedListing);
        
        // Update the listing
        const updateResponse = await fetch(`${sheetBestUrl}/${listingIndex}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedListing)
        });
        
        if (!updateResponse.ok) {
          console.error(`Failed to update listing: ${updateResponse.status} - ${updateResponse.statusText}`);
          throw new Error(`Failed to update listing: ${updateResponse.statusText}`);
        }
        
        console.log(`Successfully updated status for NFT: ${nftAddress} to ${status}`);
        return true;
      } catch (error) {
        console.error('Error using SheetBest API, falling back to Google Sheets API:', error);
        // Continue with fallback to Google Sheets API
      }
    }
    
    // Fall back to Google Sheets API
    console.log('Falling back to Google Sheets API for updateListingStatus');
    const sheets = await getSheetsAPI();
    
    // Search for the NFT in the listings
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!A:E`,
    });
    
    if (!response.data.values || response.data.values.length <= 1) {
      console.log('No listings found in the sheet');
      return false;
    }
    
    // Get headers for reference
    const headers = response.data.values[0];
    console.log('Sheet headers:', headers);
    
    // Skip header row and find matching NFT by mint_id
    const listings = response.data.values.slice(1);
    const rowIndex = listings.findIndex(row => row[0] === nftAddress);
    
    if (rowIndex === -1) {
      console.log(`No listing found for NFT: ${nftAddress}`);
      return false;
    }
    
    console.log(`Found listing at row ${rowIndex + 2}:`, listings[rowIndex]);
    
    // If unlisting or sold, delete the row instead of updating status
    if (status === 'Unlisted' || status === 'Sold') {
      console.log(`Deleting row for NFT: ${nftAddress} with status: ${status}`);
      
      // Delete the row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: 0, // Assumes the listings sheet is the first sheet
                  dimension: 'ROWS',
                  startIndex: rowIndex + 1, // +1 for header row
                  endIndex: rowIndex + 2 // +2 because end is exclusive
                }
              }
            }
          ]
        }
      });
      
      console.log(`Deleted listing row for ${nftAddress} with status: ${status}`);
      return true;
    }
    
    // For other statuses, update as before
    // For our custom sheet format, we'll add a new column for status if it doesn't exist
    let statusColumnIndex = headers.indexOf('status');
    if (statusColumnIndex === -1) {
      // Status column doesn't exist, so we'll append it
      statusColumnIndex = headers.length;
      
      console.log(`Status column not found, adding it at index ${statusColumnIndex}`);
      
      // Add 'status' to the headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LISTINGS_SHEET_NAME}!${String.fromCharCode(65 + statusColumnIndex)}1`,
        valueInputOption: 'RAW',
        resource: {
          values: [['status']]
        }
      });
      
      console.log(`Added 'status' column at index ${statusColumnIndex}`);
    }
    
    console.log(`Updating status for NFT: ${nftAddress} to ${status} at column ${String.fromCharCode(65 + statusColumnIndex)}${rowIndex + 2}`);
    
    // Update the status (rowIndex + 2 because of 0-indexing and header row)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LISTINGS_SHEET_NAME}!${String.fromCharCode(65 + statusColumnIndex)}${rowIndex + 2}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[status]],
      },
    });
    
    console.log(`Updated listing status for ${nftAddress} to ${status}`);
    return true;
  } catch (error) {
    console.error('Error updating listing status:', error);
    return false;
  }
}

// Get seller address for a specific NFT
export async function getSellerAddress(nftAddress) {
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
        const matchingListing = data.find(listing => listing.mint_id === nftAddress);
        
        if (matchingListing) {
          console.log('Found matching listing via SheetBest:', matchingListing);
          return {
            sellerAddress: matchingListing.seller_id,
            sellerId: matchingListing.seller_id
          };
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
      range: `${LISTINGS_SHEET_NAME}!A:E`, // Updated range to include all relevant columns
    });
    
    if (!response.data.values || response.data.values.length <= 1) {
      console.log('No listings found in the sheet');
      return { sellerAddress: null, sellerId: null };
    }
    
    // Log headers to help debug
    console.log('Sheet headers:', response.data.values[0]);
    
    // Skip header row and find matching NFT by mint_id (column A)
    const listings = response.data.values.slice(1);
    const matchingListing = listings.find(row => row[0] === nftAddress);
    
    if (!matchingListing) {
      console.log(`No listing found for NFT: ${nftAddress}`);
      return { sellerAddress: null, sellerId: null };
    }
    
    console.log('Found matching listing:', matchingListing);
    
    // Based on the sheet structure:
    // Column A: mint_id
    // Column B: list_date
    // Column C: list_price_sol
    // Column D: collection_id
    // Column E: seller_id
    const sellerId = matchingListing[4];
    
    // For compatibility, also return the seller_id as sellerAddress
    return { 
      sellerAddress: sellerId,
      sellerId: sellerId
    };
  } catch (error) {
    console.error('Error getting seller address:', error);
    return { sellerAddress: null, sellerId: null };
  }
}

export default {
  recordNFTListing,
  verifySellerAddress,
  updateListingStatus,
  getSellerAddress
}; 