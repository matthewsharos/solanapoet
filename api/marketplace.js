import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  TransactionSignature,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import bs58 from 'bs58';
import { getHeliusApiKey } from '../utils/config';

// Cache for the Helius connection
let cachedConnection = null;
let lastConnectionTime = 0;
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Helper Functions
const getOwnerAddress = (owner) => {
  if (typeof owner === 'string') {
    return owner;
  }
  return owner?.publicKey || '';
};

const ensureConnection = async (connection) => {
  if (connection) {
    return connection;
  }

  // Check if we have a valid cached connection
  const now = Date.now();
  if (cachedConnection && (now - lastConnectionTime) < CONNECTION_TIMEOUT) {
    return cachedConnection;
  }

  try {
    // Get the Helius API key from the server config
    const heliusApiKey = await getHeliusApiKey();
    
    console.log('Creating new Helius RPC connection...');
    const heliusMainnetRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    
    // Create new connection with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const newConnection = new Connection(heliusMainnetRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 60000, // 60 seconds
          wsEndpoint: `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        });

        // Validate the connection by getting the version
        await newConnection.getVersion();
        
        // Update cache
        cachedConnection = newConnection;
        lastConnectionTime = now;
        
        return newConnection;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        console.warn(`Connection attempt ${retryCount} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    throw new Error('Failed to create connection after maximum retries');
  } catch (error) {
    console.error('Failed to create Helius RPC connection:', error);
    // Clear cache on error
    cachedConnection = null;
    lastConnectionTime = 0;
    throw new Error(`Failed to create Helius RPC connection: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Add a function to reset the connection cache if needed
export const resetConnection = () => {
  cachedConnection = null;
  lastConnectionTime = 0;
  console.log('Connection cache reset');
};

// Cache the API base URL to avoid multiple lookups
let cachedApiBaseUrl = null;

// Reset the cached API base URL to force a new lookup
export const resetApiBaseUrlCache = () => {
  cachedApiBaseUrl = null;
  console.log('API base URL cache reset');
};

export const getApiBaseUrl = async () => {
  // In development, use relative URLs that work with Vite proxy
  if (process.env.NODE_ENV === 'development') {
    return '';  // Empty string for relative URLs
  }
  
  // In production, use the configured API URL
  return process.env.REACT_APP_API_URL || '';
};

const isNFT = (obj) => {
  return obj && typeof obj === 'object' && 'mint' in obj && !('owner' in obj && typeof obj.owner === 'object');
};

const notifyServerTransactionFailed = async (nftAddress, buyerAddress) => {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/purchase-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nftAddress, buyerAddress })
    });
    
    if (!response.ok) {
      console.error('Failed to notify server about transaction failure:', response.statusText);
    }
  } catch (error) {
    console.error('Error notifying server about transaction failure:', error);
  }
};

const notifyServer = async (nftAddress, signature, status = 'Sold') => {
  try {
    console.log(`Notifying server about transaction status: ${status} for NFT: ${nftAddress}`);
    const apiBaseUrl = await getApiBaseUrl();
    
    // Use the correct endpoint based on the status
    const endpoint = status === 'Unlisted' 
      ? `${apiBaseUrl}/api/market/update-listing-status` 
      : `${apiBaseUrl}/api/market/confirm-purchase`;
    
    // Prepare the request body based on the endpoint
    const body = status === 'Unlisted'
      ? JSON.stringify({ nftAddress, status })
      : JSON.stringify({ nftAddress, signature, status });
    
    console.log(`Sending notification to ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    if (!response.ok) {
      console.error(`Failed to notify server: ${response.status} ${response.statusText}`);
      return false;
    }
    
    console.log(`Successfully notified server about ${status} status for NFT: ${nftAddress}`);
    return true;
  } catch (error) {
    console.error('Error notifying server about transaction:', error);
    return false;
  }
};

/**
 * Properly formats a transaction for Phantom wallet to avoid base58 encoding issues
 */
const formatTransactionForPhantom = (transaction) => {
  try {
    // Serialize the transaction to the wire format
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Convert to base58 for Phantom
    const base58Transaction = bs58.encode(serializedTransaction);
    console.log('Transaction successfully encoded to base58 for Phantom');
    return base58Transaction;
  } catch (error) {
    console.error('Error formatting transaction for Phantom:', error);
    throw error;
  }
};

// Export main marketplace functions
export const listNFTForSale = async (nft, price, ownerAddressOrWallet = null, connectionOrCallback = () => {}, walletOrMaxRetries = 3) => {
  // Implementation here
  return true;
};

export const unlistNFT = async (nft, ownerAddress, connection, wallet) => {
  // Implementation here
  return true;
};

export const cleanupBurnedNFTListings = async (nftAddresses) => {
  // Implementation here
  return true;
};

export const purchaseNFT = async (nft, buyerAddress, buyerWallet, connection) => {
  // Implementation here
  return true;
};

export const fetchMetaplexListingData = async (nfts, connection) => {
  // Implementation here
  return nfts;
};

export const initializeMarketplace = async () => {
  // Implementation here
};

export const setPurchaseSuccessPopupCallback = (callback) => {
  // Implementation here
};

export const createConsistentConnection = () => {
  // Implementation here
  return new Connection('https://api.mainnet-beta.solana.com');
}; 