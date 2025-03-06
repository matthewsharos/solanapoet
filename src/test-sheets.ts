import { google } from 'googleapis';
import { GOOGLE_SHEETS_CONFIG } from './api/googleSheetsConfig';
import { OAuth2Client } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';

interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheets: {
    collections: string;
    ultimates: string;
    displayNames: string;
    artRequests: string;
  };
  credentialsPath: string;
  scopes: string[];
}

const config = GOOGLE_SHEETS_CONFIG as GoogleSheetsConfig;

async function testSheets() {
  try {
    console.log('Initializing Google Sheets API connection...');
    console.log('Using credentials file:', config.credentialsPath);
    
    const auth = new google.auth.GoogleAuth({
      keyFile: config.credentialsPath,
      scopes: config.scopes,
    });

    const authClient = await auth.getClient() as OAuth2Client;
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    console.log('Testing connection to Collections sheet...');
    const collectionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheets.collections}!A:F`,
    });

    if (collectionsResponse.data.values) {
      console.log('Collections data:', collectionsResponse.data.values);
    } else {
      console.log('No collections data found');
    }

    console.log('\nTesting connection to Display Names sheet...');
    const displayNamesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheets.displayNames}!A:B`,
    });

    if (displayNamesResponse.data.values) {
      console.log('Display Names data:', displayNamesResponse.data.values);
    } else {
      console.log('No display names data found');
    }

    console.log('\nGoogle Sheets API connection test completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSheets(); 