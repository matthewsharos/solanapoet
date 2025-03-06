// Test script to verify Google authentication with environmental variables
import { google } from 'googleapis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifyGoogleAuth() {
  console.log('Starting Google authentication verification...');
  console.log('Environment variables check:');
  console.log(`- GOOGLE_CLIENT_EMAIL: ${process.env.GOOGLE_CLIENT_EMAIL ? 'Present' : 'Missing'}`);
  console.log(`- GOOGLE_PRIVATE_KEY: ${process.env.GOOGLE_PRIVATE_KEY ? 'Present (length: ' + process.env.GOOGLE_PRIVATE_KEY.length + ')' : 'Missing'}`);
  console.log(`- GOOGLE_SHEETS_SPREADSHEET_ID: ${process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 'Not set'}`);

  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Required environment variables are missing');
    }

    console.log('Creating Google auth client with individual credentials...');
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    console.log('Getting auth client...');
    const client = await auth.getClient();
    
    console.log('Creating Google Sheets client...');
    const sheets = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0';
    
    console.log(`Attempting to access spreadsheet: ${spreadsheetId}`);
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    console.log('SUCCESS: Successfully authenticated and accessed the spreadsheet!');
    console.log('Spreadsheet title:', response.data.properties.title);
    console.log('Authentication method is working correctly');

  } catch (error) {
    console.error('ERROR: Google authentication verification failed:');
    console.error(error.message);
    if (error.response) {
      console.error('Response error data:', error.response.data);
    }
  }
}

verifyGoogleAuth();
