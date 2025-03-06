import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export const getOAuth2Client = async (): Promise<OAuth2Client> => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    return await auth.getClient() as OAuth2Client;
  } catch (error) {
    console.error('Error creating OAuth2 client:', error);
    throw error;
  }
}; 