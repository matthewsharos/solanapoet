import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

let auth: OAuth2Client | null = null;

export async function getGoogleAuth(): Promise<OAuth2Client> {
  if (auth) {
    return auth;
  }

  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Google credentials not found. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
    }

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
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
    }).getClient() as OAuth2Client;
    
    console.log('Successfully initialized Google auth with client email');
    return auth;
  } catch (error) {
    console.error('Failed to initialize Google auth:', error);
    auth = null;
    throw new Error('Google authentication failed. Please check your credentials.');
  }
} 