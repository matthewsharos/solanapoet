/**
 * Utility functions for working with wallet display names
 * These names are stored in localStorage for persistence
 */

const STORAGE_KEY = 'wallet_display_names';
let syncInProgress = false;
let syncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN = 5000; // 5 seconds cooldown between syncs

// Event name constant to ensure consistency
const DISPLAY_NAMES_UPDATED_EVENT = 'displayNamesUpdated';

/**
 * Dispatch display name update event
 * @param names Updated display names map
 */
const dispatchDisplayNamesUpdate = (names: Record<string, string>) => {
  window.dispatchEvent(new CustomEvent(DISPLAY_NAMES_UPDATED_EVENT, {
    detail: { displayNames: names }
  }));
};

/**
 * Sync display names from Google Sheets to localStorage
 * @param force If true, bypass the cooldown check
 * @returns A promise that resolves when the sync is complete
 */
export const syncDisplayNamesFromSheets = async (force: boolean = false): Promise<void> => {
  const now = Date.now();
  
  // If a sync is already in progress, return the existing promise
  if (syncPromise) {
    return syncPromise;
  }

  // If we recently synced and not forcing, don't sync again
  if (!force && now - lastSyncTime < SYNC_COOLDOWN) {
    console.log('Recent sync detected, using cached data...');
    return;
  }

  try {
    console.log('Starting display names sync from Google Sheets...');
    syncInProgress = true;
    
    // Create a new sync promise
    syncPromise = (async () => {
      const { getDisplayNames } = await import('../api/displayNames');
      const displayNames = await getDisplayNames(true); // Always get fresh data
      
      // Convert to a map for easier lookup, maintaining case sensitivity
      const namesMap: Record<string, string> = {};
      displayNames.forEach(entry => {
        if (entry && entry.wallet_address && entry.display_name) {
          // Store with original case
          namesMap[entry.wallet_address] = entry.display_name;
        }
      });
      
      // Store the new display names
      localStorage.setItem(STORAGE_KEY, JSON.stringify(namesMap));
      
      // Update last sync time
      lastSyncTime = now;
      
      // Dispatch event with the updated names
      dispatchDisplayNamesUpdate(namesMap);
      
      console.log('Display names synced from Google Sheets:', namesMap);
    })();

    await syncPromise;
  } catch (error) {
    console.error('Error syncing display names from Google Sheets:', error);
    throw error;
  } finally {
    syncInProgress = false;
    syncPromise = null;
  }
};

/**
 * Get the display name for a wallet address
 * @param walletAddress The wallet address to get the display name for
 * @returns The display name if found, undefined otherwise
 */
export const getDisplayNameForWallet = async (walletAddress: string): Promise<string | undefined> => {
  try {
    // First check localStorage
    const storedNames = localStorage.getItem(STORAGE_KEY);
    if (storedNames) {
      const namesMap = JSON.parse(storedNames);
      // Use exact case-sensitive match
      if (namesMap[walletAddress]) {
        return namesMap[walletAddress];
      }
    }
    
    // If not found in cache, sync with sheets (respecting cooldown)
    await syncDisplayNamesFromSheets(false);
    
    // Check localStorage again after sync
    const updatedNames = localStorage.getItem(STORAGE_KEY);
    const namesMap = updatedNames ? JSON.parse(updatedNames) : {};
    
    // Use exact case-sensitive match
    return namesMap[walletAddress];
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

    // Force sync from sheets to ensure we have the latest data
    await syncDisplayNamesFromSheets(true);
    
    // Double check the update was successful
    const storedNames = localStorage.getItem(STORAGE_KEY);
    const namesMap = storedNames ? JSON.parse(storedNames) : {};
    
    if (namesMap[walletAddress] !== displayName) {
      console.warn('Display name mismatch after update, retrying sync...');
      await syncDisplayNamesFromSheets(true);
    }
    
  } catch (error) {
    console.error('Error setting display name for wallet:', error);
    // On error, sync from sheets to ensure consistency
    await syncDisplayNamesFromSheets(true);
    throw error;
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
    if (namesMap[walletAddress]) {
      delete namesMap[walletAddress];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(namesMap));
      
      // Dispatch event to notify other components
      dispatchDisplayNamesUpdate(namesMap);
    }
  } catch (error) {
    console.error('Error clearing display name for wallet:', error);
  }
}; 