import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

let authClient: JWT | null = null;

export async function getGoogleAuth(): Promise<JWT> {
  if (authClient) {
    return authClient;
  }

  const credentials = {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials not configured');
  }

  authClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  await authClient.authorize();
  return authClient;
} 