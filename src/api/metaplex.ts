// Remove the module declaration since we have a proper type declaration file

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { createSignerFromKeypair, signerIdentity, sol, Umi } from '@metaplex-foundation/umi';
import { 
  mplAuctionHouse, 
  type AuctionHouse,
  type AuctionHouseListing,
  createAuctionHouse as createAH,
  findAuctionHouseByAddress,
  createListing,
  cancelListing,
  executeSale
} from '@metaplex-foundation/mpl-auction-house';
import BN from 'bn.js';
import { NFT } from '../types/nft';

// Constants
const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Types
export type ExtendedWalletAdapter = WalletContextState & {
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface Listing {
  nft: NFT;
  price: {
    amount: BN;
    currency: {
      symbol: string;
      decimals: number;
      namespace: 'native';
    };
  };
  seller: PublicKey;
  tokenSize: number;
  createdAt?: Date;
}

// Define fallback test auction houses for different networks
const NETWORK_AUCTION_HOUSES = {
  // These are example auction houses - replace with real ones if you have them
  mainnet: 'EgqSkSoCU6S7RTSzZ9Zzo6XDhBEE57eM4cPzAQg26ftG', // Our custom auction house
  devnet: 'devNetAuctionHouseAddressReplace123456789012345678901234'  // Placeholder
};

// Get the current network from the RPC URL or default to mainnet
const getCurrentNetwork = (connection: Connection): 'mainnet' | 'devnet' => {
  const endpoint = connection.rpcEndpoint.toLowerCase();
  return endpoint.includes('devnet') ? 'devnet' : 'mainnet';
};

// Instead of fs.readFileSync, use a static configuration that can be updated at runtime
let AUCTION_HOUSE_ADDRESS: PublicKey | null = null;
let AUCTION_HOUSE_CACHE: any = null;
let LAST_VERIFIED_NETWORK: 'mainnet' | 'devnet' | null = null;

/**
 * Updates the auction house address configuration
 * @param address The new auction house address to use
 * @returns True if the address was valid and set
 */
export function setAuctionHouseAddress(address: string): boolean {
  try {
    AUCTION_HOUSE_ADDRESS = new PublicKey(address);
    console.log('Updated Auction House address:', AUCTION_HOUSE_ADDRESS.toString());
    // Reset cache since the address changed
    AUCTION_HOUSE_CACHE = null;
    LAST_VERIFIED_NETWORK = null;
    return true;
  } catch (error: any) {
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
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 * @returns A configured Umi instance
 */
function getUmi(wallet: ExtendedWalletAdapter, connection: Connection): Umi {
  const umi = createUmi(connection.rpcEndpoint)
    .use(mplTokenMetadata())
    .use(mplCandyMachine())
    .use(mplToolbox())
    .use(walletAdapterIdentity(wallet));
  
  return umi;
}

// Helper function to convert lamports to SOL
function lamportsToSol(amount: number): number {
  return amount / LAMPORTS_PER_SOL;
}

// Helper function to convert SOL to lamports
function solToLamports(solAmount: number): number {
  return solAmount * LAMPORTS_PER_SOL;
}

// Helper function to format price
function formatPrice(price: BN): number {
  return price.toNumber() / LAMPORTS_PER_SOL;
}

// Helper function to convert SOL to lamports BN
function solToLamportsBN(solAmount: number): BN {
  return new BN(solAmount * LAMPORTS_PER_SOL);
}

// Helper function to convert SOL to Umi amount
function toUmiAmount(solAmount: number) {
  return sol(solAmount);
}

/**
 * Creates a new auction house for testing or use
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 * @param params Additional parameters for auction house creation
 * @returns The newly created auction house address
 */
export async function createAuctionHouse(
  wallet: WalletContextState, 
  connection: Connection,
  params: {
    sellerFeeBasisPoints?: number;
    requiresSignOff?: boolean;
    canChangeSalePrice?: boolean;
    treasuryMint?: PublicKey;
  } = {}
): Promise<string> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }
  
  const umi = getUmi(wallet as ExtendedWalletAdapter, connection)
    .use(mplAuctionHouse());
  
  // Default parameters for auction house
  const {
    sellerFeeBasisPoints = 200, // 2%
    requiresSignOff = false,
    canChangeSalePrice = false,
    treasuryMint = WRAPPED_SOL_MINT, // Default to SOL
  } = params;
  
  console.log('Creating new auction house with settings:');
  console.log('- Seller fee basis points:', sellerFeeBasisPoints);
  console.log('- Requires sign off:', requiresSignOff);
  console.log('- Can change sale price:', canChangeSalePrice);
  console.log('- Treasury mint:', treasuryMint.toString());
  
  try {
    const result = await createAH(umi, {
      authority: wallet.publicKey,
      feeWithdrawalDestination: wallet.publicKey,
      treasuryWithdrawalDestination: wallet.publicKey,
      treasuryMint,
      feePayerWithdrawalDestination: wallet.publicKey,
      requiresSignOff,
      canChangeSalePrice
    } as any);
    
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
 * @param connection The Solana connection instance
 * @returns The auction house address to use
 */
export function getAuctionHouseAddress(connection: Connection): PublicKey | null {
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
 * Verifies if an auction house account exists at the configured address
 * @param connection The Solana connection instance
 * @returns {Promise<boolean>} True if the auction house exists and is valid
 */
export async function verifyAuctionHouse(connection: Connection): Promise<boolean> {
  const auctionHouseAddress = getAuctionHouseAddress(connection);
  
  if (!auctionHouseAddress) {
    console.error('No auction house address configured');
    return false;
  }

  // Check if the network has changed since last verification
  const currentNetwork = getCurrentNetwork(connection);
  if (LAST_VERIFIED_NETWORK && LAST_VERIFIED_NETWORK !== currentNetwork) {
    console.log('Network changed, clearing auction house cache');
    AUCTION_HOUSE_CACHE = null;
  }

  try {
    // Create a non-authenticated Umi instance for verification
    const umi = createUmi(connection.rpcEndpoint);
    
    // If we have a cached auction house and network hasn't changed, use it
    if (AUCTION_HOUSE_CACHE && LAST_VERIFIED_NETWORK === currentNetwork) {
      console.log('Using cached auction house:', AUCTION_HOUSE_CACHE.address.toString());
      return true;
    }
    
    console.log('Attempting to verify auction house at address:', auctionHouseAddress.toString());
    
    // Check if account exists first
    const accountInfo = await connection.getAccountInfo(auctionHouseAddress);
    if (!accountInfo) {
      console.error('No account exists at the auction house address');
      return false;
    }
    
    // Try to fetch the auction house - this will throw if it doesn't exist or isn't valid
    const auctionHouse = await findAuctionHouseByAddress(umi.use(mplAuctionHouse()), auctionHouseAddress as any);
    
    // Cache the verified auction house
    AUCTION_HOUSE_CACHE = auctionHouse;
    LAST_VERIFIED_NETWORK = currentNetwork;
    
    console.log('Auction house verified successfully:', auctionHouse.address.toString());
    console.log('Fee account:', auctionHouse.feeAccount.toString());
    console.log('Treasury account:', auctionHouse.treasuryAccount.toString());
    
    return true;
  } catch (error: any) {
    console.error('Failed to verify auction house:', error);
    
    // Try to provide more helpful error messages
    if (error.message && error.message.includes('not of the expected type')) {
      console.error('The account exists but is not an auction house. You may need to create a new auction house.');
    } else if (error.message && error.message.includes('AccountNotFoundError')) {
      console.error('The auction house account does not exist. You may need to create it first.');
    }
    
    return false;
  }
}

export async function listNFTForSaleMetaplex(
  wallet: WalletContextState,
  umi: Umi,
  nftMint: PublicKey,
  price: number,
  auctionHouse: AuctionHouse
): Promise<void> {
  try {
    const params = {
      auctionHouse,
      mint: nftMint,
      price: sol(price),
      seller: wallet.publicKey
    } as any;

    await createListing(umi, params);
  } catch (error) {
    console.error('Error listing NFT:', error);
    throw error;
  }
}

export async function unlistNFTMetaplex(
  wallet: WalletContextState,
  umi: Umi,
  listing: AuctionHouseListing,
  auctionHouse: AuctionHouse
): Promise<void> {
  try {
    await cancelListing(umi, {
      auctionHouse,
      listing
    });
  } catch (error) {
    console.error('Error unlisting NFT:', error);
    throw error;
  }
}

export async function purchaseNFTMetaplex(
  wallet: WalletContextState,
  umi: Umi,
  listing: AuctionHouseListing,
  auctionHouse: AuctionHouse
): Promise<void> {
  try {
    const params = {
      auctionHouse,
      listing,
      buyer: wallet.publicKey
    } as any;

    await executeSale(umi, params);
  } catch (error) {
    console.error('Error purchasing NFT:', error);
    throw error;
  }
}

/**
 * Fetches all listings from the Metaplex Auction House
 * @param connection The Solana connection instance
 * @returns An array of listings with NFT mint addresses and prices
 */
export async function fetchMetaplexListings(
  connection: Connection
): Promise<Array<{ mint: string; price: number; auctionHouse: string }>> {
  const umi = createUmi(connection.rpcEndpoint)
    .use(mplTokenMetadata())
    .use(mplCandyMachine())
    .use(mplToolbox());
  
  try {
    // Implementation using umi
    return [];
  } catch (error) {
    console.error('Error fetching Metaplex listings:', error);
    return [];
  }
}

/**
 * Fetches and applies Metaplex listing data to a list of NFTs
 * @param nfts Array of NFT objects
 * @param connection The Solana connection instance
 * @returns Updated NFT array with listing information
 */
export async function fetchMetaplexListingData<T extends { mint: string }>(
  nfts: T[],
  connection: Connection
): Promise<(T & { price: number | null; listed: boolean; auctionHouse?: string })[]> {
  const umi = createUmi(connection.rpcEndpoint)
    .use(mplTokenMetadata())
    .use(mplCandyMachine())
    .use(mplToolbox());
  
  try {
    // Implementation using umi
    return nfts.map(nft => ({
      ...nft,
      price: null,
      listed: false
    }));
  } catch (error) {
    console.error('Error fetching Metaplex listing data:', error);
    return nfts.map(nft => ({
      ...nft,
      price: null,
      listed: false
    }));
  }
}

export async function handleListings(listing: Listing): Promise<void> {
  try {
    const price = convertListingPrice(listing.price.amount);
    console.log(`Handling listing for NFT ${listing.nft.mint} at price ${price} SOL`);
    // Implementation
  } catch (error) {
    console.error('Error handling listing:', error);
  }
}

export async function filterListings(listing: Listing): Promise<boolean> {
  try {
    const price = convertListingPrice(listing.price.amount);
    return price > 0; // Basic filter example
  } catch (error) {
    console.error('Error filtering listing:', error);
    return false;
  }
}

// Update the listing price conversion functions
function convertListingPrice(price: BN): number {
  return price.toNumber() / LAMPORTS_PER_SOL;
}

// Update the listing filter functions
function filterListingsByPrice(listings: Listing[], minPrice?: number, maxPrice?: number): Listing[] {
  return listings.filter(listing => {
    const price = convertListingPrice(listing.price.amount);
    if (minPrice !== undefined && price < minPrice) return false;
    if (maxPrice !== undefined && price > maxPrice) return false;
    return true;
  });
}

export async function createAuctionHouseMetaplex(
  wallet: WalletContextState,
  connection: Connection
): Promise<AuctionHouse> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const umi = createUmi(connection.rpcEndpoint)
    .use(mplAuctionHouse())
    .use(walletAdapterIdentity(wallet as any));

  try {
    const result = await createAH(umi, {
      authority: wallet.publicKey,
      feeWithdrawalDestination: wallet.publicKey,
      treasuryWithdrawalDestination: wallet.publicKey,
      treasuryMint: new PublicKey('So11111111111111111111111111111111111111112'),
      feePayerWithdrawalDestination: wallet.publicKey,
      requiresSignOff: false,
      canChangeSalePrice: false
    } as any);
    
    return result.auctionHouse;
  } catch (error) {
    console.error('Error creating auction house:', error);
    throw error;
  }
} 