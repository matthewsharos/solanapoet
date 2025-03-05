// Simple test script to verify Google Sheets integrations

const SHEETS_API_URL = 'https://api.sheetbest.com/sheets/3c05631c-0279-4e0b-b101-e0701e19a8f3';
const COLLECTIONS_API_URL = 'https://api.sheetbest.com/sheets/3c05631c-0279-4e0b-b101-e0701e19a8f3/tabs/collections';

// Test data
const testNFT = {
  mint_id: 'TEST_MINT_' + Date.now().toString(),
  list_date: new Date().toISOString(),
  list_price_sol: '1.5',
  collection_id: 'TEST_COLLECTION'
};

const testCollectionData = {
  address: 'TEST_COLLECTION_' + Date.now().toString(),
  name: 'Test Collection',
  image: 'https://example.com/test.png',
  description: 'Test collection description',
  addedAt: Date.now().toString()
};

// Test NFT listing
async function testNFTListing() {
  try {
    console.log('Testing NFT listing with data:', testNFT);
    
    const response = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testNFT)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add test NFT: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Successfully added test NFT:', result);
    return true;
  } catch (error) {
    console.error('Error sending test NFT data:', error);
    return false;
  }
}

// Test collection
async function testCollectionAdd() {
  try {
    console.log('Testing collection with data:', testCollectionData);
    
    const response = await fetch(COLLECTIONS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCollectionData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add test collection: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Successfully added test collection:', result);
    return true;
  } catch (error) {
    console.error('Error sending test collection data:', error);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('Starting Google Sheets integration tests...');
  
  // Test NFT listing
  const nftResult = await testNFTListing();
  console.log('NFT listing test ' + (nftResult ? 'PASSED' : 'FAILED'));
  
  // Test collection
  const collectionResult = await testCollectionAdd();
  console.log('Collection test ' + (collectionResult ? 'PASSED' : 'FAILED'));
  
  console.log('Tests completed!');
}

runTests().catch(console.error); 