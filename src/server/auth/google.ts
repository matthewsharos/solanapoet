import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

let auth: OAuth2Client | null = null;

export async function getGoogleAuth(): Promise<OAuth2Client> {
  if (auth) {
    return auth;
  }

  try {
    // First try using direct client email and private key env variables
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Initializing auth using GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
      
      // Process private key to handle possible missing actual newlines
      let privateKey = process.env.GOOGLE_PRIVATE_KEY;
      if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
        console.log('Converting escaped newlines in private key to actual newlines');
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      auth = await new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      }).getClient() as OAuth2Client;
      console.log('Successfully initialized Google Sheets auth with client email');
      return auth;
    }
    
    // Next try using JSON credentials from env
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

    throw new Error('No Google credentials found. Set either GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_CREDENTIALS, or GOOGLE_APPLICATION_CREDENTIALS environment variables');
  } catch (error) {
    console.error('Failed to initialize Google Sheets auth:', error);
    auth = null;
    throw new Error('Google Sheets authentication failed. Please check your credentials.');
  }
} 