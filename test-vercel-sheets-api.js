// Test script to check the standalone Google Sheets API endpoint
import { request } from 'https';

const VERCEL_URL = 'https://solanapoet.vercel.app';

// Test the Google Sheets API endpoint
function checkSheetsApi() {
  return new Promise((resolve, reject) => {
    console.log(`Checking Google Sheets API at ${VERCEL_URL}/api/sheets-test`);
    
    const options = {
      hostname: 'solanapoet.vercel.app',
      path: '/api/sheets-test',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    };

    const req = request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
        
        try {
          const result = data ? JSON.parse(data) : null;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('SUCCESS: Google Sheets API check succeeded!');
            console.log('Response:', JSON.stringify(result, null, 2));
            resolve(result);
          } else {
            console.error(`ERROR: Request failed with status code ${res.statusCode}`);
            console.error('Response:', result || data);
            reject(new Error(`Request failed with status code ${res.statusCode}: ${result?.error?.message || 'Unknown error'}`));
          }
        } catch (error) {
          console.error('ERROR: Failed to parse response data');
          console.error('Raw response:', data);
          console.error(error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('ERROR: Request error:', error);
      reject(error);
    });
    
    // Set timeout to 30 seconds
    req.setTimeout(30000, () => {
      console.error('ERROR: Request timed out');
      req.destroy();
      reject(new Error('Request timed out after 30 seconds'));
    });
    
    req.end();
  });
}

// Run the test
checkSheetsApi()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error.message);
    process.exit(1);
  }); 