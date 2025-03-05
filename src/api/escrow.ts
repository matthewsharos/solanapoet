/**
 * API functions for interacting with the escrow server
 */

// Get the API base URL with the port detection logic
const getEscrowServer = async (): Promise<string> => {
  // Try to get the last known port from localStorage first
  try {
    const savedPort = localStorage.getItem('escrow_server_port');
    if (savedPort) {
      const port = parseInt(savedPort, 10);
      console.log(`Trying last known escrow port from localStorage: ${port}`);
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000)
        });
        
        if (response.ok) {
          console.log(`Successfully connected to escrow server on port ${port}`);
          return `http://localhost:${port}`;
        }
      } catch (error) {
        console.log(`Last known escrow port ${port} is not available`);
      }
    }
  } catch (e) {
    console.warn('Could not access localStorage:', e);
  }
  
  // Try a wide range of ports
  // Start with common ports, then scan a range
  // Put port 3002 first since that's where the escrow server is running
  const commonPorts = [3002, 3001, 3012, 3011, 3021, 3031, 3041, 3051, 3061];
  const portRanges = [
    { start: 3000, end: 3020 },  // Check 3000-3020
    { start: 3050, end: 3070 },  // Check 3050-3070
    { start: 8000, end: 8020 }   // Check 8000-8020
  ];
  
  // Try common ports first
  for (const port of commonPorts) {
    try {
      console.log(`Trying to connect to escrow server on port ${port}...`);
      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        // Store the port in localStorage for future use
        try {
          localStorage.setItem('escrow_server_port', port.toString());
        } catch (e) {
          console.warn('Could not store port in localStorage:', e);
        }
        
        console.log(`Found escrow server on port ${port}`);
        return `http://localhost:${port}`;
      }
    } catch (error) {
      console.log(`Server not available on port ${port}`);
    }
  }
  
  // Then try port ranges
  for (const range of portRanges) {
    for (let port = range.start; port <= range.end; port++) {
      // Skip ports we already tried
      if (commonPorts.includes(port)) continue;
      
      try {
        console.log(`Scanning port ${port} for escrow server...`);
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          // Add a timeout to avoid hanging
          signal: AbortSignal.timeout(500)
        });
        
        if (response.ok) {
          // Store the port in localStorage for future use
          try {
            localStorage.setItem('escrow_server_port', port.toString());
          } catch (e) {
            console.warn('Could not store port in localStorage:', e);
          }
          
          console.log(`Found escrow server on port ${port}`);
          return `http://localhost:${port}`;
        }
      } catch (error) {
        // Just continue to the next port
      }
    }
  }
  
  // If we still haven't found a server, try a more aggressive approach
  // Try to find any server running on ports 3000-4000
  console.log('Trying more aggressive port scanning for escrow server...');
  for (let port = 3000; port <= 4000; port += 5) {
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(300)
      });
      
      if (response.ok) {
        try {
          localStorage.setItem('escrow_server_port', port.toString());
        } catch (e) {
          console.warn('Could not store port in localStorage:', e);
        }
        console.log(`Found escrow server on port ${port} during aggressive scan`);
        return `http://localhost:${port}`;
      }
    } catch (error) {
      // Just continue to the next port
    }
  }
  
  // Default fallback - use 3002 as it's where the escrow server is running
  console.warn('Could not detect escrow server port, using default 3002');
  return 'http://localhost:3002';
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