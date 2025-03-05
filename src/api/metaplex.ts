import { 
  Metaplex, 
  walletAdapterIdentity, 
  WRAPPED_SOL_MINT, 
  lamports,
  toPublicKey,
  CreateAuctionHouseInput
} from '@metaplex-foundation/js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletAdapter } from '@solana/wallet-adapter-base';
import { NFT } from '../types/nft';

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
  // Use the successfully created auction house address
  setAuctionHouseAddress('EgqSkSoCU6S7RTSzZ9Zzo6XDhBEE57eM4cPzAQg26ftG');
  console.log('Successfully initialized hardcoded Auction House address');
} catch (error) {
  console.error('Error initializing Auction House address:', error);
  console.warn('Listing functions will be disabled until an auction house is configured.');
}

/**
 * Initializes a Metaplex instance with the wallet and connection
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 * @returns A configured Metaplex instance
 */
function getMetaplex(wallet: WalletAdapter, connection: Connection) {
  return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
}

/**
 * Creates a new auction house for testing or use
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 * @param params Additional parameters for auction house creation
 * @returns The newly created auction house address
 */
export async function createAuctionHouse(
  wallet: WalletAdapter, 
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
  
  const metaplex = getMetaplex(wallet, connection);
  
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
    const { auctionHouse } = await metaplex.auctionHouse().create({
      sellerFeeBasisPoints,
      requiresSignOff,
      canChangeSalePrice,
      treasuryMint,
    });
    
    const address = auctionHouse.address.toString();
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
    // Create a non-authenticated Metaplex instance for verification
    const metaplex = Metaplex.make(connection);
    
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
    const auctionHouse = await metaplex.auctionHouse().findByAddress({ 
      address: auctionHouseAddress 
    });
    
    // Cache the verified auction house
    AUCTION_HOUSE_CACHE = auctionHouse;
    LAST_VERIFIED_NETWORK = currentNetwork;
    
    console.log('Auction house verified successfully:', auctionHouse.address.toString());
    console.log('Fee account:', auctionHouse.feeAccountAddress.toString());
    console.log('Treasury account:', auctionHouse.treasuryAccountAddress.toString());
    
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

/**
 * Lists an NFT for sale on the Metaplex Auction House
 * @param nft The NFT object to list
 * @param price The price in SOL to list the NFT for
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 * @returns The result of the listing operation
 */
export async function listNFTForSaleMetaplex(
  nft: NFT, 
  price: number, 
  wallet: WalletAdapter, 
  connection: Connection
) {
  try {
    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    
    if (!AUCTION_HOUSE_ADDRESS) {
      throw new Error("Auction house not configured");
    }
    
    // Create a connection with confirmed commitment for better transaction confirmation
    const confirmedConnection = new Connection(
      connection.rpcEndpoint, 
      { commitment: 'confirmed', confirmTransactionInitialTimeout: 60000 }
    );
    
    // First verify the auction house exists
    const isValid = await verifyAuctionHouse(confirmedConnection);
    if (!isValid) {
      throw new Error("The auction house at the configured address is not valid. Please check your configuration.");
    }
    
    // Make sure we're using our custom auction house, not the default Metaplex one
    const auctionHouseAddressStr = AUCTION_HOUSE_ADDRESS.toString();
    console.log('Using auction house address:', auctionHouseAddressStr);
    if (auctionHouseAddressStr === 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk') {
      console.warn('Warning: Using the default Metaplex auction house address! This may not be what you want.');
      throw new Error('You are using the default Metaplex auction house address, not your custom one. Please check your configuration.');
    }
    
    const metaplex = getMetaplex(wallet, confirmedConnection);
    const auctionHouse = await metaplex.auctionHouse().findByAddress({ address: AUCTION_HOUSE_ADDRESS });
    
    // Convert price from SOL to lamports
    const priceInLamports = lamports(price * 1_000_000_000);
    
    // Fetch the NFT data from chain
    const mintAddress = new PublicKey(nft.mint);
    
    // Check if the seller has enough SOL to cover rent and fees
    const walletBalance = await confirmedConnection.getBalance(wallet.publicKey);
    const minimumTransactionFee = 1_000_000; // 0.001 SOL for transaction fees
    const rentExemptionAmount = 900_000; // 0.0009 SOL (approximately the 897,840 lamports in the error)
    const requiredBalance = minimumTransactionFee + rentExemptionAmount; // Total required
    
    if (walletBalance < requiredBalance) {
      throw new Error(`Insufficient SOL balance. You need at least ${requiredBalance / 1_000_000_000} SOL to list an NFT (${minimumTransactionFee / 1_000_000_000} SOL for transaction fees and ${rentExemptionAmount / 1_000_000_000} SOL for account rent).`);
    }
    
    console.log(`Listing NFT ${nft.mint} for ${price} SOL using auction house: ${AUCTION_HOUSE_ADDRESS.toString()}`);
    
    // IMPORTANT: First check if this NFT is already listed and cancel if necessary
    console.log("Checking for existing listings...");
    try {
      // Find listings for this NFT by this seller on our auction house
      const listings = await metaplex.auctionHouse().findListings({
        auctionHouse,
        seller: wallet.publicKey,
        mint: mintAddress
      });
      
      // If there are existing listings on our auction house, cancel them first
      if (listings.length > 0) {
        console.log(`Found ${listings.length} existing listings for this NFT on our auction house. Cancelling...`);
        
        for (const listing of listings) {
          try {
            console.log(`Cancelling listing with price ${listing.price.basisPoints.toNumber() / 1_000_000_000} SOL`);
            await metaplex.auctionHouse().cancelListing({
              auctionHouse,
              listing: listing as any // Type assertion to fix the linter error
            });
            console.log("Existing listing cancelled successfully");
          } catch (cancelError) {
            console.warn("Error cancelling existing listing:", cancelError);
            // Continue to try listing anyway
          }
        }
      }
      
      // Now also check if this NFT is listed on the default Metaplex auction house
      // This is important to catch the case where the NFT is listed on the default auction house
      try {
        // Create a Metaplex instance for checking the default auction house
        const defaultAuctionHouseAddress = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
        console.log("Checking if NFT is listed on default Metaplex auction house:", defaultAuctionHouseAddress.toString());
        
        const defaultAuctionHouse = await metaplex.auctionHouse().findByAddress({ 
          address: defaultAuctionHouseAddress 
        });
        
        // Check for listings on the default auction house
        const defaultListings = await metaplex.auctionHouse().findListings({
          auctionHouse: defaultAuctionHouse,
          seller: wallet.publicKey,
          mint: mintAddress
        });
        
        if (defaultListings.length > 0) {
          console.log(`Found ${defaultListings.length} existing listings for this NFT on the default Metaplex auction house.`);
          console.log("This explains the 'already initialized' error you're seeing.");
          
          // Now we know the NFT is already listed on the default auction house
          // We need to handle this case properly
          let listingDetails = defaultListings.map(listing => {
            return {
              price: listing.price.basisPoints.toNumber() / 1_000_000_000,
              createdAt: listing.createdAt ? new Date(listing.createdAt).toISOString() : 'unknown date'
            };
          });
          
          const errorMessage = 
            `This NFT is already listed on the default Metaplex auction house at price(s): ` +
            `${listingDetails.map(l => `${l.price} SOL (created: ${l.createdAt})`).join(', ')}. ` +
            `\n\nTo list on our custom auction house, you need to cancel the existing listing first. ` +
            `Unfortunately, you must use a wallet tool that can interact with the default auction house to cancel it.`;
          
          console.error(errorMessage);
          throw new Error(errorMessage);
        } else {
          console.log("No listings found on default Metaplex auction house for this NFT.");
        }
      } catch (defaultAhError) {
        console.warn("Could not check default Metaplex auction house:", defaultAhError);
        // Continue with our listing attempt
      }
    } catch (findError) {
      console.warn("Error finding existing listings:", findError);
      // If the error is specifically about an NFT being on the default auction house, re-throw it
      if (findError && typeof findError === 'object' && 'message' in findError && 
          typeof findError.message === 'string' && 
          findError.message.includes("default Metaplex auction house")) {
        throw findError;
      }
      // Otherwise continue to try listing anyway
    }
    
    // Now attempt to list the NFT with improved error handling
    try {
      console.log("Submitting listing transaction...");
      const result = await metaplex.auctionHouse().list({
        auctionHouse,
        mintAccount: mintAddress,
        price: priceInLamports
      });
      
      console.log(`NFT listed successfully: ${nft.mint} for ${price} SOL`);
      if (result.sellerTradeState) {
        console.log(`Seller trade state: ${result.sellerTradeState.toString()}`);
        
        // STRICT VERIFICATION: Only consider a listing successful if we can verify it on-chain
        console.log("Verifying listing exists on-chain before returning success...");
        
        // Try to verify up to 3 times with delays between attempts
        let verificationListings: any[] = [];
        let verified = false;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`Verification attempt ${attempt} of 3...`);
            
            // Wait longer between each attempt
            if (attempt > 1) {
              const delayMs = attempt * 1000; // 1s, 2s, 3s
              console.log(`Waiting ${delayMs}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            verificationListings = await metaplex.auctionHouse().findListings({
              auctionHouse,
              seller: wallet.publicKey,
              mint: mintAddress
            });
            
            if (verificationListings.length > 0) {
              console.log("✅ Listing verified - found on-chain after creation");
              verified = true;
              break;
            }
            
            console.log("Listing not found in verification attempt", attempt);
          } catch (verifyError) {
            console.warn(`Error during verification attempt ${attempt}:`, verifyError);
          }
        }
        
        if (verified) {
          // Return the verified listing from chain instead of the initial result
          return verificationListings[0];
        } else {
          // If we couldn't verify the listing after multiple attempts, throw an error
          console.error("❌ Could not verify listing exists on-chain after multiple attempts");
          throw new Error("Listing could not be verified on-chain. Please try again later.");
        }
      } else {
        throw new Error("Listing transaction completed but did not return a valid seller trade state.");
      }
    } catch (error: any) {
      console.error("Error listing NFT:", error);
      
      // Check for specific error messages
      const errorMessage = error.message || "";
      
      // Handle "Already initialized" error
      if (errorMessage.includes("already initialized")) {
        console.warn("NFT already listed. Will attempt to fetch the existing listing.");
        
        // Extract the auction house address from the error message if possible
        const auctionHouseMatch = errorMessage.match(/\[([1-9A-HJ-NP-Za-km-z]{32,44})\]/);
        const errorAuctionHouse = auctionHouseMatch ? auctionHouseMatch[1] : null;
        
        if (errorAuctionHouse && errorAuctionHouse !== AUCTION_HOUSE_ADDRESS.toString()) {
          console.warn(`Error occurred with a different auction house: ${errorAuctionHouse}`);
          console.warn(`Current auction house: ${AUCTION_HOUSE_ADDRESS.toString()}`);
          
          // Important: At this point, we know the NFT is listed on a different auction house
          // We should return an appropriate error message to the user
          if (errorAuctionHouse === "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk") {
            // Now we'll add a more detailed error message with advice for the user
            
            // First try to get the listing details from the default auction house
            try {
              const defaultAuctionHouseAddress = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
              const defaultAuctionHouse = await metaplex.auctionHouse().findByAddress({ 
                address: defaultAuctionHouseAddress 
              });
              
              const defaultListings = await metaplex.auctionHouse().findListings({
                auctionHouse: defaultAuctionHouse,
                seller: wallet.publicKey,
                mint: mintAddress
              });
              
              if (defaultListings.length > 0) {
                const listingDetails = defaultListings.map(listing => {
                  return {
                    price: listing.price.basisPoints.toNumber() / 1_000_000_000,
                    createdAt: listing.createdAt ? new Date(listing.createdAt).toISOString() : 'unknown date'
                  };
                });
                
                throw new Error(
                  `This NFT is already listed on the default Metaplex auction house at price(s): ` +
                  `${listingDetails.map(l => `${l.price} SOL (created: ${l.createdAt})`).join(', ')}. ` +
                  `\n\nTo list on our custom auction house, you need to cancel the existing listing first. ` +
                  `Unfortunately, you must use a wallet tool that can interact with the default auction house to cancel it.`
                );
              }
            } catch (detailError) {
              console.warn("Could not fetch detailed listing information:", detailError);
            }
            
            // Fall back to a generic message if we couldn't get detailed information
            throw new Error(
              "This NFT appears to be listed on the default Metaplex auction house, which is different from our custom auction house. " +
              "To use this NFT with our marketplace, you'll need to cancel the listing on the default auction house first. " +
              "You can use tools like Solana Explorer or Magic Eden to cancel the listing."
            );
          }
        }
        
        // Try to fetch from our configured auction house
        try {
          console.log("Attempting to fetch existing listing from our auction house:", AUCTION_HOUSE_ADDRESS.toString());
          const existingListings = await metaplex.auctionHouse().findListings({
            auctionHouse,
            seller: wallet.publicKey,
            mint: mintAddress
          });
          
          if (existingListings.length > 0) {
            console.log("Found existing listing in our auction house:", existingListings[0]);
            return existingListings[0];
          } else {
            console.log("No listing found in our auction house");
            
            // Since we know the default auction house is not working properly,
            // we'll just throw an error rather than trying to fetch from it
            throw new Error(
              "NFT appears to be already listed, but the listing could not be found in our auction house. " +
              "This might be due to a listing on a different auction house or an incomplete previous listing."
            );
          }
        } catch (fetchError) {
          console.error("Error fetching listing from our auction house:", fetchError);
          throw new Error("Failed to verify existing listing. Please try again later.");
        }
      }
      
      // Handle insufficient lamports error
      if (errorMessage.includes("insufficient lamports")) {
        // Extract required amount from error message if available
        const matches = errorMessage.match(/(\d+) lamports/);
        const requiredLamports = matches ? parseInt(matches[1]) : rentExemptionAmount + minimumTransactionFee;
        
        const walletBalance = await confirmedConnection.getBalance(wallet.publicKey);
        const balanceSOL = walletBalance / LAMPORTS_PER_SOL;
        const requiredSOL = requiredLamports / LAMPORTS_PER_SOL;
        
        throw new Error(
          `Insufficient SOL balance to list NFT. You have ${balanceSOL.toFixed(6)} SOL but need approximately ${requiredSOL.toFixed(6)} SOL. ` +
          `Please add more SOL to your wallet (at least ${(requiredSOL - balanceSOL).toFixed(6)} SOL more).`
        );
      }
      
      // Re-throw any other errors
      throw error;
    }
  } catch (error) {
    console.error("Error listing NFT on Metaplex:", error);
    throw error;
  }
}

/**
 * Unlists an NFT from the Metaplex Auction House
 * @param nft The NFT object to unlist
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 */
export async function unlistNFTMetaplex(
  nft: NFT, 
  wallet: WalletAdapter, 
  connection: Connection
) {
  try {
    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    
    if (!AUCTION_HOUSE_ADDRESS) {
      throw new Error("Auction house not configured");
    }
    
    const metaplex = getMetaplex(wallet, connection);
    const auctionHouse = await metaplex.auctionHouse().findByAddress({ address: AUCTION_HOUSE_ADDRESS });
    
    // Fetch the NFT data from chain
    const mintAddress = new PublicKey(nft.mint);
    
    // Find listings for this NFT by this seller
    let listings: any[] = [];
    try {
      // Try with mint parameter first (newer SDK versions)
      listings = await metaplex.auctionHouse().findListings({
        auctionHouse,
        seller: wallet.publicKey,
        mint: mintAddress
      });
    } catch (e) {
      // Fallback for older SDK versions
      console.warn("Error using mint parameter, trying alternative method:", e);
    }
    
    if (listings.length === 0) {
      console.warn(`No listings found for NFT ${nft.mint}`);
      return;
    }
    
    // Cancel the first listing found
    const listing = listings[0];
    await metaplex.auctionHouse().cancelListing({
      auctionHouse,
      listing
    });
    
    console.log(`NFT unlisted successfully: ${nft.mint}`);
  } catch (error) {
    console.error("Error unlisting NFT on Metaplex:", error);
    throw error;
  }
}

/**
 * Purchases an NFT from the Metaplex Auction House
 * @param nft The NFT object to purchase
 * @param wallet The connected wallet adapter
 * @param connection The Solana connection instance
 */
export async function purchaseNFTMetaplex(
  nft: NFT, 
  wallet: WalletAdapter, 
  connection: Connection
) {
  try {
    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    
    if (!nft.price) {
      throw new Error("NFT is not listed for sale");
    }
    
    // Create a connection with confirmed commitment for better transaction confirmation
    const confirmedConnection = new Connection(
      connection.rpcEndpoint, 
      { commitment: 'confirmed', confirmTransactionInitialTimeout: 60000 }
    );
    
    // Create Metaplex instance
    const metaplex = getMetaplex(wallet, confirmedConnection);
    
    // Fetch the NFT data from chain
    const mintAddress = new PublicKey(nft.mint);
    
    // Check if nft has auctionHouse property (added by fetchMetaplexListingData)
    let auctionHouseAddress: PublicKey;
    
    if ((nft as any).auctionHouse) {
      // If we know the auction house (from earlier listing data retrieval)
      try {
        auctionHouseAddress = new PublicKey((nft as any).auctionHouse);
        console.log(`Using known auction house for purchase: ${auctionHouseAddress.toString()}`);
      } catch (error) {
        console.error("Invalid auction house address from NFT:", error);
        throw new Error("Invalid auction house address for this NFT");
      }
    } else if (AUCTION_HOUSE_ADDRESS) {
      // Otherwise use our configured auction house
      auctionHouseAddress = AUCTION_HOUSE_ADDRESS;
      console.log(`Using default auction house for purchase: ${auctionHouseAddress.toString()}`);
    } else {
      throw new Error("No auction house configured and NFT doesn't specify an auction house");
    }
    
    // Get the auction house
    const auctionHouse = await metaplex.auctionHouse().findByAddress({ 
      address: auctionHouseAddress 
    });
    
    // Find listings for this NFT on the specified auction house
    console.log(`Searching for listings of NFT ${nft.mint} on auction house ${auctionHouseAddress.toString()}`);
    const listings = await metaplex.auctionHouse().findListings({
      auctionHouse,
      mint: mintAddress
    });
    
    if (listings.length === 0) {
      throw new Error(`No listings found for NFT ${nft.mint} on this auction house`);
    }
    
    console.log(`Found ${listings.length} listings for NFT ${nft.mint}`);
    
    // Find the listing with the price that matches our NFT's price
    // Note: Price might be slightly different due to rounding, so we'll use approximate matching
    const priceInLamports = nft.price * 1_000_000_000;
    const listing = listings.find(l => {
      const listingPrice = l.price.basisPoints.toNumber();
      const priceDiff = Math.abs(listingPrice - priceInLamports);
      // Allow for a small difference (less than 0.001 SOL or 1,000,000 lamports)
      return priceDiff < 1_000_000;
    });
    
    if (!listing) {
      throw new Error(`No listing found with price ${nft.price} SOL. Available prices: ${
        listings.map(l => l.price.basisPoints.toNumber() / 1_000_000_000).join(', ')
      } SOL`);
    }
    
    console.log(`Found matching listing with price ${listing.price.basisPoints.toNumber() / 1_000_000_000} SOL`);
    
    // Execute the purchase with better error handling
    try {
      console.log(`Submitting purchase transaction...`);
      const result = await metaplex.auctionHouse().buy({
        auctionHouse,
        listing: listing as any // Type assertion to fix the incompatible types issue
      });
      
      console.log(`NFT purchase submitted successfully: ${nft.mint} for ${nft.price} SOL`);
      
      // Log the result in a type-safe way
      try {
        // Safely extract signature or other identifiers
        const resultObj = result as any;
        const txDetails = resultObj.response?.signature || 
                         resultObj.signature || 
                         'Transaction submitted';
        console.log(`Transaction details: ${txDetails}`);
      } catch (err) {
        console.log('Transaction submitted but details unavailable');
      }
      
      // Verify the purchase was successful
      console.log("Purchase transaction submitted. Please check your wallet for the NFT.");
      
      return result;
    } catch (purchaseError: any) {
      console.error("Error during purchase transaction:", purchaseError);
      
      // Handle specific error cases
      const errorMessage = purchaseError.message || "";
      
      if (errorMessage.includes("insufficient funds")) {
        throw new Error(`Insufficient funds to complete purchase. You need at least ${nft.price} SOL plus transaction fees.`);
      } else if (errorMessage.includes("already bought")) {
        throw new Error("This NFT was already purchased. Please refresh your page to see updates.");
      } else {
        throw new Error(`Failed to purchase NFT: ${errorMessage}`);
      }
    }
  } catch (error: any) {
    console.error("Error purchasing NFT on Metaplex:", error);
    throw error;
  }
}

/**
 * Fetches all listings from the Metaplex Auction House
 * @param connection The Solana connection instance
 * @returns An array of listings with NFT mint addresses and prices
 */
export async function fetchMetaplexListings(connection: Connection): Promise<{ mint: string; price: number; auctionHouse: string }[]> {
  // If auction house address is not configured, return empty array
  if (!AUCTION_HOUSE_ADDRESS) {
    console.warn("Auction house not configured, skipping listing fetch");
    return [];
  }

  try {
    console.log("Fetching listings from our auction house:", AUCTION_HOUSE_ADDRESS.toString());
    
    // Create a connection with confirmed commitment for more reliable results
    const confirmedConnection = new Connection(
      connection.rpcEndpoint, 
      { commitment: 'confirmed', confirmTransactionInitialTimeout: 60000 }
    );
    
    // Create a Metaplex instance without a wallet (read-only)
    const metaplex = Metaplex.make(confirmedConnection);
    
    // Combined results array
    let allListings: { mint: string; price: number; auctionHouse: string }[] = [];
    
    // Fetch listings from our configured auction house
    try {
      // Get the auction house
      const auctionHouse = await metaplex.auctionHouse().findByAddress({ address: AUCTION_HOUSE_ADDRESS });
      
      // Fetch all listings from the auction house
      const listings = await metaplex.auctionHouse().findListings({
        auctionHouse
      });
      
      console.log(`Found ${listings.length} active listings in our auction house`);
      
      // Map listings to the format used by our app
      const formattedListings = listings.map(listing => {
        let mint = '';
        try {
          // Try different property paths depending on SDK version
          if ('mint' in listing && listing.mint) {
            mint = listing.mint.toString();
          } else if ('asset' in listing && listing.asset && 'mint' in listing.asset) {
            mint = listing.asset.mint.address.toString();
          } else if ('mintAccount' in listing) {
            mint = (listing as any).mintAccount.toBase58();
          }
          
          // Validate that we could extract a mint
          if (!mint) {
            console.warn("Could not extract mint from listing:", listing);
            return null;
          }
          
          // The price is accessed through listing.price.basisPoints
          const price = listing.price.basisPoints.toNumber() / 1_000_000_000; // Convert lamports to SOL
          
          console.log(`Found listing for mint ${mint} at price ${price} SOL in our auction house`);
          
          return { mint, price, auctionHouse: AUCTION_HOUSE_ADDRESS ? AUCTION_HOUSE_ADDRESS.toString() : 'unknown' };
        } catch (e) {
          console.error("Error processing listing:", e);
          return null;
        }
      }).filter(listing => listing !== null) as { mint: string; price: number; auctionHouse: string }[];
      
      allListings = allListings.concat(formattedListings);
    } catch (error) {
      console.error("Error fetching listings from our auction house:", error);
    }
    
    // Also check the default Metaplex auction house
    try {
      // Default Metaplex auction house address
      const defaultAuctionHouseAddress = new PublicKey("hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk");
      console.log("Checking for listings in default Metaplex auction house:", defaultAuctionHouseAddress.toString());
      
      try {
        // Attempt to find the default auction house
        const defaultAuctionHouse = await metaplex.auctionHouse().findByAddress({ 
          address: defaultAuctionHouseAddress 
        });
        
        // Fetch listings from default auction house
        const defaultListings = await metaplex.auctionHouse().findListings({
          auctionHouse: defaultAuctionHouse
        });
        
        console.log(`Found ${defaultListings.length} active listings in default Metaplex auction house`);
        
        // Process default auction house listings
        const defaultFormattedListings = defaultListings.map(listing => {
          let mint = '';
          try {
            // Extract mint address using the same logic as above
            if ('mint' in listing && listing.mint) {
              mint = listing.mint.toString();
            } else if ('asset' in listing && listing.asset && 'mint' in listing.asset) {
              mint = listing.asset.mint.address.toString();
            } else if ('mintAccount' in listing) {
              mint = (listing as any).mintAccount.toBase58();
            }
            
            if (!mint) {
              return null;
            }
            
            const price = listing.price.basisPoints.toNumber() / 1_000_000_000;
            console.log(`Found listing for mint ${mint} at price ${price} SOL in default Metaplex auction house`);
            
            return { mint, price, auctionHouse: defaultAuctionHouseAddress.toString() };
          } catch (e) {
            console.error("Error processing default auction house listing:", e);
            return null;
          }
        }).filter(listing => listing !== null) as { mint: string; price: number; auctionHouse: string }[];
        
        allListings = allListings.concat(defaultFormattedListings);
      } catch (ahError) {
        console.error("Could not find the default Metaplex auction house:", ahError);
      }
    } catch (defaultAhError) {
      console.error("Error fetching from default Metaplex auction house:", defaultAhError);
    }
    
    console.log(`Combined total: Found ${allListings.length} active listings across all auction houses`);
    return allListings;
  } catch (error) {
    console.error("Error fetching Metaplex listings:", error);
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
  try {
    // Return NFTs without listing data if there are none or auction house is not configured
    if (!nfts.length) {
      return nfts.map(nft => ({
        ...nft,
        price: null,
        listed: false
      }));
    }

    console.log(`Fetching listing data for ${nfts.length} NFTs...`);

    // Fetch all listings from Metaplex (including default auction house)
    let listings = await fetchMetaplexListings(connection);
    console.log(`Got ${listings.length} listings from auction houses`);
    
    // If no listings found initially, wait a moment and try again
    // This helps with blockchain finality issues
    if (listings.length === 0) {
      console.log("No listings found initially, waiting 2 seconds and retrying...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      listings = await fetchMetaplexListings(connection);
      console.log(`Retry found ${listings.length} listings from auction houses`);
    }
    
    // Create a map for quick lookup
    const listingsByMint = new Map<string, { price: number; auctionHouse: string }>();
    for (const listing of listings) {
      if (listing.mint) {
        listingsByMint.set(listing.mint, { 
          price: listing.price, 
          auctionHouse: listing.auctionHouse 
        });
      }
    }
    
    // Apply listings to NFTs
    const updatedNfts = nfts.map(nft => {
      const listingInfo = listingsByMint.get(nft.mint);
      
      if (listingInfo) {
        const { price, auctionHouse } = listingInfo;
        console.log(`NFT ${nft.mint} is listed for ${price} SOL on auction house ${auctionHouse}`);
        
        // If it's on the default auction house, add a warning indicator
        const isDefaultAuctionHouse = auctionHouse === "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk";
        if (isDefaultAuctionHouse) {
          console.warn(`⚠️ NFT ${nft.mint} is listed on the default Metaplex auction house`);
        }
        
        return {
          ...nft,
          price,
          listed: true,
          auctionHouse,
          isOnDefaultAuctionHouse: isDefaultAuctionHouse // Add a flag to indicate if it's on the default auction house
        };
      }
      
      return {
        ...nft,
        price: null,
        listed: false
      };
    });
    
    // Log summary of listed NFTs
    const listedCount = updatedNfts.filter(nft => (nft as any).listed).length;
    console.log(`Found ${listedCount} listed NFTs out of ${nfts.length} total`);
    
    // Group by auction house for analytics
    if (listedCount > 0) {
      const byAuctionHouse: Record<string, number> = {};
      updatedNfts.forEach(nft => {
        if ((nft as any).listed && (nft as any).auctionHouse) {
          const ah = (nft as any).auctionHouse;
          byAuctionHouse[ah] = (byAuctionHouse[ah] || 0) + 1;
        }
      });
      
      console.log("Listings by auction house:", byAuctionHouse);
    }
    
    return updatedNfts;
  } catch (error) {
    console.error("Error applying Metaplex listing data:", error);
    // Return NFTs without listing data
    return nfts.map(nft => ({
      ...nft,
      price: null,
      listed: false
    }));
  }
} 