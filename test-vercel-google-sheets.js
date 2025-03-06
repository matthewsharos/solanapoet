// Test script to verify Google Sheets connection on Vercel deployment
const https = require('https');

const VERCEL_URL = 'https://solanapoet.vercel.app';

// Test the connection to Google Sheets via our new test endpoint
function testGoogleSheetsConnection() {
  return new Promise((resolve, reject) => {
    console.log(`Testing Google Sheets connection at ${VERCEL_URL}/api/sheets/test-connection`);
    
    const options = {
      hostname: 'solanapoet.vercel.app',
      path: '/api/sheets/test-connection',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            console.log('SUCCESS: Google Sheets connection test succeeded!');
            console.log('Response:', JSON.stringify(result, null, 2));
            resolve(result);
          } catch (error) {
            console.error('ERROR: Failed to parse response data');
            console.error(error);
            reject(error);
          }
        } else {
          console.error(`ERROR: Request failed with status code ${res.statusCode}`);
          console.error('Response:', data);
          reject(new Error(`Request failed with status code ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('ERROR: Request error:', error);
      reject(error);
    });
    
    req.end();
  });
}

// Run the test
testGoogleSheetsConnection()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error.message);
    process.exit(1);
  }); 