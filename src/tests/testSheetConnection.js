// Simple test script to verify Google Sheets connection
import { createSheetsClient, GOOGLE_SHEETS_CONFIG } from '../api/googleSheetsConfig';

// Mock NFT object
const testNFT = {
  mint: "test_" + Date.now().toString(),
  name: "Test NFT " + new Date().toISOString(),
  image: "https://example.com/image.jpg",
  description: "This is a test NFT created to verify Google Sheets integration"
};

// Function to send test data directly
async function sendTestData() {
  console.log("Sending test NFT data to Google Sheets...");
  
  try {
    const sheetsClient = await createSheetsClient();
    
    // Using the column names we received in the response
    const newListing = {
      mint_id: testNFT.mint,
      list_date: new Date().toISOString(),
      list_price_sol: "1.5",
      collection_id: "test_collection"
    };

    // Append the new listing
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.listings}!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          newListing.mint_id,
          newListing.list_date,
          newListing.list_price_sol,
          newListing.collection_id
        ]]
      }
    });

    console.log("Success! Test data added to Google Sheet");
    
    // Now let's read the current data
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.listings}!A:D`
    });
    
    console.log("Current listings in Google Sheet:", response.data.values);
    
  } catch (error) {
    console.error("Error sending test data:", error);
  }
}

// Execute the test
sendTestData();

console.log("To run this test, use:");
console.log("node src/tests/testSheetConnection.js"); 