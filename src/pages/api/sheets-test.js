// Standalone API endpoint for testing Google Sheets authentication
import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    console.log('Google Sheets test API route called');

    // Process private key to handle escaped newlines
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
      console.log('Converting escaped newlines in private key to actual newlines');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // Create auth client with individual credentials
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Created GoogleAuth instance, attempting to get client...');
    const client = await auth.getClient();
    
    console.log('Successfully got auth client, creating sheets client...');
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    console.log('Attempting to access spreadsheet...');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    return res.status(200).json({
      status: 'success',
      message: 'Google Sheets authentication successful',
      spreadsheetTitle: response.data.properties?.title,
      sheets: response.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean)
    });
  } catch (error) {
    console.error('Google Sheets test API route error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 