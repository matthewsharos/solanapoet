// API base URL based on environment
export const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? '' // Empty string will use relative URLs that work with Vite proxy
  : process.env.REACT_APP_API_URL || '';

// Helius API base URL
export const HELIUS_API_BASE_URL = process.env.NODE_ENV === 'development'
  ? '/api/nft/helius'  // Use relative URL for Vite proxy
  : `${process.env.REACT_APP_API_URL}/api/nft/helius` || ''; 