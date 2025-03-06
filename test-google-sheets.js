import { google } from 'googleapis';

async function testGoogleSheets() {
  try {
    // Parse the credentials JSON and fix private key format
    const rawCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
    const credentials = {
      ...rawCredentials,
      private_key: rawCredentials.private_key.replace(/\\n/g, '\n')
    };
    
    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Your spreadsheet ID
    const spreadsheetId = '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0';

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
      console.error('Credentials error. Please check your GOOGLE_CREDENTIALS_JSON environment variable');
    }
  }
}

testGoogleSheets(); 