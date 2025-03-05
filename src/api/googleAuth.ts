import { google } from 'googleapis';

// This is a simplified auth service for demo purposes
// In a production app, you would use proper OAuth flow with secure storage
// of credentials and tokens

// Google OAuth client ID and redirect URI
// For a production app, these would come from environment variables
const CLIENT_ID = 'YOUR_CLIENT_ID'; // Replace with your actual client ID
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET'; // Replace with your actual client secret
const REDIRECT_URI = 'http://localhost:5173/auth/google/callback';

// The OAuth2 client
let oAuth2Client: any = null;

// Initialize the OAuth2 client
export const initOAuth2Client = () => {
  oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  // Check if we have tokens in localStorage
  const tokens = localStorage.getItem('google_tokens');
  if (tokens) {
    oAuth2Client.setCredentials(JSON.parse(tokens));
  }

  return oAuth2Client;
};

// Get the OAuth2 client - initialize if not already done
export const getOAuth2Client = () => {
  if (!oAuth2Client) {
    return initOAuth2Client();
  }
  return oAuth2Client;
};

// Check if the user is authenticated
export const isAuthenticated = () => {
  const client = getOAuth2Client();
  const tokens = client.credentials;
  return tokens && tokens.access_token;
};

// Generate an authentication URL
export const getAuthUrl = () => {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/spreadsheets'],
    prompt: 'consent'
  });
};

// Handle the authentication callback
export const handleAuthCallback = async (code: string) => {
  const client = getOAuth2Client();
  
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    
    // Save tokens to localStorage (in a real app, store securely)
    localStorage.setItem('google_tokens', JSON.stringify(tokens));
    
    return true;
  } catch (error) {
    console.error('Error getting tokens:', error);
    return false;
  }
};

// Logout function - clear credentials
export const logout = () => {
  if (oAuth2Client) {
    oAuth2Client.credentials = {};
  }
  localStorage.removeItem('google_tokens');
};

// For demo and simplicity, we'll use a simple API key approach instead of full OAuth
// This will work for read-only access to public spreadsheets
export const getApiKey = () => {
  return 'YOUR_API_KEY'; // Replace with your actual API key
}; 