import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

let auth: OAuth2Client | null = null;

export async function getGoogleAuth(): Promise<OAuth2Client> {
  if (auth) {
    return auth;
  }

  try {
    // First try using direct credentials from env
    if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.log('Initializing auth using credentials from GOOGLE_SHEETS_CREDENTIALS');
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
      auth = await new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      }).getClient() as OAuth2Client;
      console.log('Successfully initialized Google Sheets auth');
      return auth;
    }
    
    // Then try using credentials file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('Initializing auth using credentials file from GOOGLE_APPLICATION_CREDENTIALS');
      auth = await new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      }).getClient() as OAuth2Client;
      console.log('Successfully initialized Google Sheets auth');
      return auth;
    }

    throw new Error('Neither GOOGLE_SHEETS_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS environment variable is set');
  } catch (error) {
    console.error('Failed to initialize Google Sheets auth:', error);
    auth = null;
    throw new Error('Google Sheets authentication failed. Please check your credentials.');
  }
} 