import { google } from 'googleapis';

async function testGoogleSheets() {
  try {
    let auth;
    let client;
    
    // First try using direct client email and private key env variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Using GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
      
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      
      client = await auth.getClient();
    } 
    // Fall back to JSON credentials
    else if (process.env.GOOGLE_CREDENTIALS_JSON) {
      console.log('Using GOOGLE_CREDENTIALS_JSON');
      // Parse the credentials JSON and fix private key format
      const rawCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
      const credentials = {
        ...rawCredentials,
        private_key: rawCredentials.private_key.replace(/\\n/g, '\n')
      };
      
      // Create auth client
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      client = await auth.getClient();
    } else {
      throw new Error('No Google credentials found. Set either GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY or GOOGLE_CREDENTIALS_JSON environment variables');
    }
    
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Your spreadsheet ID - use the one from environment or default to the provided one
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0';

    // Test reading from the collections sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'collections!A1:Z'  // Adjust range as needed
    });

    console.log('Successfully connected to Google Sheets!');
    console.log('Data from collections sheet:', response.data.values);
    
  } catch (error) {
    console.error('Error testing Google Sheets:', error.message);
    console.error('Full error:', error);
    if (error.message.includes('credentials')) {
      console.error('Credentials error. Please check your Google credentials environment variables');
    }
  }
}

testGoogleSheets(); 