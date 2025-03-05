import { google } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from './api/googleSheetsConfig';
import { OAuth2Client } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';

async function testGoogleSheetsConnection() {
  try {
    console.log('Initializing Google Sheets API connection...');
    console.log('Using credentials file:', GOOGLE_SHEETS_CONFIG.credentialsPath);
    
    const auth = new google.auth.GoogleAuth({
      keyFile: GOOGLE_SHEETS_CONFIG.credentialsPath,
      scopes: GOOGLE_SHEETS_CONFIG.scopes,
    });

    const authClient = await auth.getClient() as OAuth2Client;
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    console.log('Testing connection to Collections sheet...');
    const collectionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.collections}!A:F`,
    });

    if (collectionsResponse.data.values) {
      console.log('Collections data:', collectionsResponse.data.values);
    } else {
      console.log('No collections data found');
    }

    console.log('\nTesting connection to Display Names sheet...');
    const displayNamesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`,
    });

    if (displayNamesResponse.data.values) {
      console.log('Display Names data:', displayNamesResponse.data.values);
    } else {
      console.log('No display names data found');
    }

    console.log('\nGoogle Sheets API connection test completed successfully!');
  } catch (error) {
    console.error('Error testing Google Sheets connection:', error);
    process.exit(1);
  }
}

testGoogleSheetsConnection(); 