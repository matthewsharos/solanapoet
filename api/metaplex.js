import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { createSignerFromKeypair, signerIdentity, sol, Umi } from '@metaplex-foundation/umi';
import { 
  findAuctionHouseByAddress,
  createAuctionHouse as createAH,
  createListing as createAHListing,
  cancelListing as cancelAHListing,
  executeSale as executeAHSale,
  mplAuctionHouse
} from '@metaplex-foundation/mpl-auction-house';
import BN from 'bn.js';

// Constants
const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Define fallback test auction houses for different networks
const NETWORK_AUCTION_HOUSES = {
  mainnet: 'EgqSkSoCU6S7RTSzZ9Zzo6XDhBEE57eM4cPzAQg26ftG', // Our custom auction house
  devnet: 'devNetAuctionHouseAddressReplace123456789012345678901234'  // Placeholder
};

// Get the current network from the RPC URL or default to mainnet
const getCurrentNetwork = (connection) => {
  const endpoint = connection.rpcEndpoint.toLowerCase();
  return endpoint.includes('devnet') ? 'devnet' : 'mainnet';
};

// Instead of fs.readFileSync, use a static configuration that can be updated at runtime
let AUCTION_HOUSE_ADDRESS = null;
let AUCTION_HOUSE_CACHE = null;
let LAST_VERIFIED_NETWORK = null;

/**
 * Updates the auction house address configuration
 */
export function setAuctionHouseAddress(address) {
  try {
    AUCTION_HOUSE_ADDRESS = new PublicKey(address);
    console.log('Updated Auction House address:', AUCTION_HOUSE_ADDRESS.toString());
    // Reset cache since the address changed
    AUCTION_HOUSE_CACHE = null;
    LAST_VERIFIED_NETWORK = null;
    return true;
  } catch (error) {
    console.error('Invalid Auction House address:', error);
    return false;
  }
}

// Initialize with the default value from configuration
try {
  setAuctionHouseAddress('EgqSkSoCU6S7RTSzZ9Zzo6XDhBEE57eM4cPzAQg26ftG');
  console.log('Successfully initialized hardcoded Auction House address');
} catch (error) {
  console.error('Error initializing Auction House address:', error);
  console.warn('Listing functions will be disabled until an auction house is configured.');
}

/**
 * Initializes a Umi instance with the wallet and connection
 */
function getUmi(wallet, connection) {
  const umi = createUmi(connection.rpcEndpoint)
    .use(mplTokenMetadata())
    .use(mplCandyMachine())
    .use(mplToolbox())
    .use(walletAdapterIdentity(wallet));
  
  return umi;
}

// Helper functions
const lamportsToSol = (amount) => amount / LAMPORTS_PER_SOL;
const solToLamports = (solAmount) => solAmount * LAMPORTS_PER_SOL;
const formatPrice = (price) => price.toNumber() / LAMPORTS_PER_SOL;
const solToLamportsBN = (solAmount) => new BN(solAmount * LAMPORTS_PER_SOL);
const toUmiAmount = (solAmount) => sol(solAmount);

/**
 * Creates a new auction house for testing or use
 */
export async function createAuctionHouse(wallet, connection, params = {}) {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }
  
  const umi = getUmi(wallet, connection).use(mplAuctionHouse());
  
  // Default parameters for auction house
  const {
    sellerFeeBasisPoints = 200, // 2%
    requiresSignOff = false,
    canChangeSalePrice = false,
    treasuryMint = WRAPPED_SOL_MINT, // Default to SOL
  } = params;
  
  console.log('Creating new auction house with settings:', {
    sellerFeeBasisPoints,
    requiresSignOff,
    canChangeSalePrice,
    treasuryMint: treasuryMint.toString()
  });
  
  try {
    const result = await createAH(umi, {
      authority: wallet.publicKey,
      feeWithdrawalDestination: wallet.publicKey,
      treasuryWithdrawalDestination: wallet.publicKey,
      treasuryMint,
      feePayerWithdrawalDestination: wallet.publicKey,
      requiresSignOff,
      canChangeSalePrice
    });
    
    const address = result.auctionHouse.address.toString();
    console.log('Auction house created successfully:', address);
    
    // Update the global auction house address
    setAuctionHouseAddress(address);
    
    // Also save to localStorage for persistence
    try {
      localStorage.setItem('auction_house_address', address);
      localStorage.setItem('auction_house_created_at', new Date().toISOString());
      localStorage.setItem('auction_house_network', getCurrentNetwork(connection));
    } catch (e) {
      console.warn('Could not save auction house to localStorage:', e);
    }
    
    return address;
  } catch (error) {
    console.error('Error creating auction house:', error);
    throw error;
  }
}

/**
 * Gets the current auction house address or falls back to a network-specific one
 */
export function getAuctionHouseAddress(connection) {
  // If we have a manually configured address, use that
  if (AUCTION_HOUSE_ADDRESS) {
    return AUCTION_HOUSE_ADDRESS;
  }
  
  // Try to load from localStorage
  try {
    const savedAddress = localStorage.getItem('auction_house_address');
    const savedNetwork = localStorage.getItem('auction_house_network');
    const currentNetwork = getCurrentNetwork(connection);
    
    if (savedAddress && savedNetwork === currentNetwork) {
      const pubkey = new PublicKey(savedAddress);
      AUCTION_HOUSE_ADDRESS = pubkey;
      return pubkey;
    }
  } catch (e) {
    console.warn('Error reading auction house from localStorage:', e);
  }
  
  // Fall back to a network-specific default if available
  const network = getCurrentNetwork(connection);
  const defaultAddress = NETWORK_AUCTION_HOUSES[network];
  
  if (defaultAddress) {
    try {
      const pubkey = new PublicKey(defaultAddress);
      AUCTION_HOUSE_ADDRESS = pubkey;
      return pubkey;
    } catch (e) {
      console.warn(`Invalid default auction house address for ${network}:`, e);
    }
  }
  
  return null;
}

/**
 * Verifies that the auction house exists and is valid
 */
export async function verifyAuctionHouse(connection) {
  try {
    const address = getAuctionHouseAddress(connection);
    if (!address) {
      console.warn('No auction house address configured');
      return false;
    }

    // Create a temporary Umi instance for verification
    const umi = createUmi(connection.rpcEndpoint)
      .use(mplAuctionHouse());

    const auctionHouse = await findAuctionHouseByAddress(umi, { address });
    
    if (!auctionHouse) {
      console.warn('Auction house not found');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error verifying auction house:', error);
    return false;
  }
}

/**
 * Lists an NFT for sale using Metaplex
 */
export async function listNFTForSaleMetaplex(wallet, umi, nftMint, price, auctionHouse) {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  try {
    await createAHListing(umi, {
      auctionHouse,
      tokenMint: nftMint,
      price: toUmiAmount(price),
      tokenSize: 1n
    });
    
    console.log('NFT listed successfully');
  } catch (error) {
    console.error('Error listing NFT:', error);
    throw error;
  }
}

/**
 * Unlists an NFT from sale using Metaplex
 */
export async function unlistNFTMetaplex(wallet, umi, listing, auctionHouse) {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  try {
    await cancelAHListing(umi, {
      auctionHouse,
      listing
    });
    
    console.log('NFT unlisted successfully');
  } catch (error) {
    console.error('Error unlisting NFT:', error);
    throw error;
  }
}

/**
 * Purchases an NFT using Metaplex
 */
export async function purchaseNFTMetaplex(wallet, umi, listing, auctionHouse) {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  try {
    await executeAHSale(umi, {
      auctionHouse,
      listing
    });
    
    console.log('NFT purchased successfully');
  } catch (error) {
    console.error('Error purchasing NFT:', error);
    throw error;
  }
}

/**
 * Fetches all Metaplex listings
 */
export async function fetchMetaplexListings(connection) {
  try {
    const umi = createUmi(connection.rpcEndpoint)
      .use(mplAuctionHouse());
    
    // Implement your listing fetching logic here
    return [];
  } catch (error) {
    console.error('Error fetching listings:', error);
    return [];
  }
}

/**
 * Fetches listing data for a set of NFTs
 */
export async function fetchMetaplexListingData(nfts, connection) {
  try {
    const umi = createUmi(connection.rpcEndpoint)
      .use(mplAuctionHouse());
    
    // Implement your listing data fetching logic here
    return nfts.map(nft => ({
      ...nft,
      price: null,
      listed: false
    }));
  } catch (error) {
    console.error('Error fetching listing data:', error);
    return nfts.map(nft => ({
      ...nft,
      price: null,
      listed: false
    }));
  }
} 