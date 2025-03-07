// API configuration
export const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '' // Use relative URLs in production
  : 'http://localhost:3002';

export const HELIUS_API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api/nft/helius' // Use relative URL in production
  : 'http://localhost:3002/api/nft/helius';

// API base URL based on environment
export const API_BASE_URL_OLD = process.env.NODE_ENV === 'development' 
  ? '' // Empty string will use relative URLs that work with Vite proxy
  : ''; // Empty string for production too, since we're using relative URLs

// Helius API base URL
export const HELIUS_API_BASE_URL_OLD = process.env.NODE_ENV === 'development'
  ? '/api/nft/helius'  // Use relative URL for Vite proxy
  : '/api/nft/helius'; // Use relative URL in production too 