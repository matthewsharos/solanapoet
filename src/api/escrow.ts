/**
 * API functions for interacting with the escrow server
 */

// Get the API base URL with the port detection logic
const getEscrowServer = async (): Promise<string> => {
  // In development, use relative URLs that work with Vite proxy
  if (process.env.NODE_ENV === 'development') {
    return '';  // Empty string for relative URLs
  }
  
  // In production, use the configured API URL
  return process.env.REACT_APP_API_URL || '';
};

// Reset the cached server URL to force a new lookup
export const resetEscrowServerCache = (): void => {
  cachedEscrowServer = null;
  console.log('Escrow server cache reset');
};

// Cache the server URL to avoid multiple lookups
let cachedEscrowServer: string | null = null;

// Helper to get the escrow server URL
const getEscrowServerUrl = async (): Promise<string> => {
  if (!cachedEscrowServer) {
    cachedEscrowServer = await getEscrowServer();
  }
  return cachedEscrowServer;
};

/**
 * Checks if the provided wallet address is the original seller of a listed NFT
 * 
 * @param nftAddress The address of the NFT 
 * @param walletAddress The wallet address to check
 * @returns Promise<boolean> True if the wallet is the original seller
 */
export const isOriginalSeller = async (nftAddress: string, walletAddress: string): Promise<boolean> => {
  let retryCount = 0;
  const maxRetries = 3;
  
  const attemptRequest = async (): Promise<boolean> => {
    try {
      // Special case for royalty receiver (this should match the server-side check)
      const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
      
      if (walletAddress === ROYALTY_RECEIVER_ADDRESS) {
        console.log(`ROYALTY RECEIVER OVERRIDE: Forcing recognition as seller for NFT ${nftAddress}`);
        return true;
      }
      
      // Get the current escrow server base URL
      const escrowServer = await getEscrowServerUrl();
      
      console.log(`Attempting to use check-seller endpoint at ${escrowServer}/check-seller`);
      
      try {
        const response = await fetch(`${escrowServer}/check-seller`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nftAddress,
            walletAddress
          }),
          signal: AbortSignal.timeout(5000)
        });

        // Check if response is ok before trying to parse JSON
        if (response.ok) {
          // Check content type to ensure we're getting JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.error('Error checking original seller: Response is not JSON');
          } else {
            const data = await response.json();
            console.log('Check-seller response:', data);
            
            // Log the important values for debugging
            if (data.isOriginalSeller) {
              console.log(`✅ Wallet ${walletAddress} IS verified as the seller of NFT ${nftAddress}`);
            } else {
              console.log(`❌ Wallet ${walletAddress} is NOT verified as the seller of NFT ${nftAddress}`);
            }
            
            return data.isOriginalSeller || false;
          }
        } else {
          console.error(`Failed to check seller: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log('Error with direct endpoint:', error);
      }
      
      // If we have retries left, try again with a fresh server URL
      if (retryCount < maxRetries) {
        retryCount++;
        resetEscrowServerCache();
        console.log(`Retrying seller check with new port detection (attempt ${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await attemptRequest();
      }
      
      console.error('Could not verify seller after multiple attempts');
      return false;
    } catch (error) {
      console.error('Error checking original seller:', error);
      
      // If there's a connection error, reset the cache to try a different port
      if (retryCount < maxRetries) {
        retryCount++;
        resetEscrowServerCache();
        console.log(`Retrying with new port detection (attempt ${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay
        return await attemptRequest();
      }
      
      return false;
    }
  };
  
  return attemptRequest();
}; 