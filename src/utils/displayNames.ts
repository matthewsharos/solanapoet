/**
 * Utility functions for working with wallet display names
 * These names are stored in localStorage for persistence
 */

const STORAGE_KEY = 'wallet_display_names';
let syncInProgress = false;
let syncTimeout: NodeJS.Timeout | null = null;

/**
 * Normalize a wallet address to ensure consistent matching
 * @param address The wallet address to normalize
 * @returns The normalized address (lowercase)
 */
export const normalizeAddress = (address: string): string => {
  return address.toLowerCase();
};

/**
 * Sync display names from Google Sheets to localStorage
 * @returns A promise that resolves when the sync is complete
 */
export const syncDisplayNamesFromSheets = async (): Promise<void> => {
  // Prevent multiple syncs from running simultaneously
  if (syncInProgress) {
    console.log('Display names sync already in progress, skipping...');
    return;
  }

  // Clear any pending sync
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Debounce the sync operation
  syncTimeout = setTimeout(async () => {
    try {
      console.log('Starting display names sync from Google Sheets...');
      syncInProgress = true;
      const { getDisplayNames } = await import('../api/displayNames');
      const displayNames = await getDisplayNames();
      
      console.log('Fetched display names:', displayNames);
      
      // Compare with existing names to avoid unnecessary updates
      const existingNames = localStorage.getItem(STORAGE_KEY);
      const existingMap = existingNames ? JSON.parse(existingNames) : {};
      
      // Only update if the names have changed
      if (JSON.stringify(displayNames) !== JSON.stringify(existingMap)) {
        console.log('Display names changed, updating localStorage...');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(displayNames));
        window.dispatchEvent(new CustomEvent('displayNamesUpdated'));
      } else {
        console.log('Display names unchanged, no update needed');
      }
    } catch (error) {
      console.error('Error syncing display names from Google Sheets:', error);
    } finally {
      syncInProgress = false;
      syncTimeout = null;
    }
  }, 100); // Reduced from 500ms to 100ms for faster updates
};

/**
 * Get the display name for a wallet address
 * @param walletAddress The wallet address to get the display name for
 * @returns The display name if found, undefined otherwise
 */
export const getDisplayNameForWallet = async (walletAddress: string): Promise<string | undefined> => {
  try {
    // First try to get from localStorage
    const storedNames = localStorage.getItem(STORAGE_KEY);
    const namesMap = storedNames ? JSON.parse(storedNames) : {};
    const normalizedAddress = normalizeAddress(walletAddress);
    
    // If we have a cached name, return it
    if (namesMap[normalizedAddress]) {
      return namesMap[normalizedAddress];
    }
    
    // If not found in localStorage, sync with Google Sheets and try again
    await syncDisplayNamesFromSheets();
    
    // Check localStorage again after sync
    const updatedNames = localStorage.getItem(STORAGE_KEY);
    const updatedMap = updatedNames ? JSON.parse(updatedNames) : {};
    return updatedMap[normalizedAddress];
  } catch (error) {
    console.error('Error getting display name for wallet:', error);
    return undefined;
  }
};

/**
 * Set the display name for a wallet address
 * @param walletAddress The wallet address to set the display name for
 * @param displayName The display name to associate with the wallet address
 */
export const setDisplayNameForWallet = async (walletAddress: string, displayName: string): Promise<void> => {
  try {
    // Update Google Sheets first
    const { updateDisplayName } = await import('../api/displayNames');
    const success = await updateDisplayName(walletAddress, displayName);
    
    if (!success) {
      throw new Error('Failed to update display name in Google Sheets');
    }

    // After successful Google Sheets update, update localStorage
    const storedNames = localStorage.getItem(STORAGE_KEY) || '{}';
    const namesMap = JSON.parse(storedNames);
    const normalizedAddress = normalizeAddress(walletAddress);
    namesMap[normalizedAddress] = displayName;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(namesMap));
    
    // Dispatch event to notify components to update
    window.dispatchEvent(new CustomEvent('displayNamesUpdated', {
      detail: {
        walletAddress: normalizedAddress,
        displayName: displayName
      }
    }));
  } catch (error) {
    console.error('Error setting display name for wallet:', error);
    // On error, sync from sheets to ensure consistency
    await syncDisplayNamesFromSheets();
    throw error; // Re-throw to let the UI handle the error
  }
};

/**
 * Get all stored display names
 * @returns An object mapping wallet addresses to display names
 */
export const getAllDisplayNames = (): Record<string, string> => {
  try {
    const storedNames = localStorage.getItem(STORAGE_KEY) || '{}';
    return JSON.parse(storedNames);
  } catch (error) {
    console.error('Error getting all display names:', error);
    return {};
  }
};

/**
 * Clear the display name for a wallet address
 * @param walletAddress The wallet address to clear the display name for
 */
export const clearDisplayNameForWallet = (walletAddress: string): void => {
  try {
    const storedNames = localStorage.getItem(STORAGE_KEY);
    if (!storedNames) return;
    
    const namesMap = JSON.parse(storedNames);
    const normalizedAddress = normalizeAddress(walletAddress);
    if (namesMap[normalizedAddress]) {
      delete namesMap[normalizedAddress];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(namesMap));
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('wallet-display-name-changed', {
        detail: { walletAddress: normalizedAddress, displayName: undefined }
      }));
    }
  } catch (error) {
    console.error('Error clearing display name for wallet:', error);
  }
}; 