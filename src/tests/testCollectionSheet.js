// Simple test script to verify Google Sheets collections functionality
import { createSheetsClient, GOOGLE_SHEETS_CONFIG } from '../api/googleSheetsConfig';

// Test collection
const testCollection = {
  address: "test_collection_" + Date.now().toString(),
  name: "Test Collection " + new Date().toISOString().substring(0, 10),
  image: "https://example.com/collection.jpg",
  description: "This is a test collection to verify Google Sheets integration",
  addedAt: Date.now()
};

// Function to send test collection data directly
async function sendTestCollection() {
  console.log("Sending test collection data to Google Sheets...");
  console.log("Using collections sheet:", GOOGLE_SHEETS_CONFIG.sheets.collections);
  
  try {
    const sheetsClient = await createSheetsClient();
    
    // Append the new collection
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.collections}!A:E`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          testCollection.address,
          testCollection.name,
          testCollection.image,
          testCollection.description,
          testCollection.addedAt
        ]]
      }
    });

    console.log("Success! Test collection added to Google Sheet");
    
    // Now let's read the current data
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.collections}!A:E`
    });
    
    console.log("Current collections in Google Sheet:", response.data.values);
    
  } catch (error) {
    console.error("Error sending test collection:", error);
  }
}

// Execute the test
sendTestCollection();

console.log("To run this test, use:");
console.log("node src/tests/testCollectionSheet.js"); 