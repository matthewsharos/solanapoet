/**
 * Utility functions for working with wallet display names
 * These names are stored in localStorage for persistence
 */

import { displayNames } from '../api/client';
import type { DisplayNameMapping } from '../types/api';

const STORAGE_KEY = 'wallet_display_names';
const CACHE_EXPIRY_KEY = 'wallet_display_names_expiry';
const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const ERROR_COOLDOWN_KEY = 'wallet_display_names_error_cooldown';
const ERROR_COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutes cooldown after error
const CACHE_VERSION_KEY = 'wallet_display_names_version';
const CURRENT_CACHE_VERSION = '1.3'; // Incremented to force cache refresh

// Batch update handling
const BATCH_UPDATE_DELAY = 500; // 500ms delay for batch processing
const BATCH_SIZE_LIMIT = 10; // Maximum number of addresses to batch in one request

// Cache display names in memory
let displayNamesCache: Map<string, string> = new Map();
let isSyncInProgress = false;
let lastCacheUpdate = 0;
let cacheMetrics = {
  hits: 0,
  misses: 0,
  staleHits: 0,
  networkRequests: 0
};

// Request batching
let pendingAddressQueue: string[] = [];
let batchProcessingTimeout: NodeJS.Timeout | null = null;
let pendingPromises: Map<string, { resolve: (name: string | null) => void, reject: (error: Error) => void }> = new Map();

// Track recently updated addresses so we always get fresh data
const recentlyUpdatedAddresses: Set<string> = new Set();

// Add a debounce delay for display name updates
const DEBOUNCE_DELAY = 300;

// Add a pending updates queue
const pendingUpdates = new Map<string, NodeJS.Timeout>();

// Log metrics periodically
const logMetrics = () => {
  if (cacheMetrics.hits % 25 === 0 && cacheMetrics.hits > 0) {
    console.log('[DisplayNames Cache] Metrics:', cacheMetrics);
  }
};

/**
 * Define an interface for the display names update event detail
 */
interface DisplayNamesUpdateDetail {
  [key: string]: string | boolean | number | undefined;
  __forceRefresh?: boolean;
  __updatedAddress?: string;
  __timestamp?: number;
}

/**
 * Clear all display names from localStorage and memory
 */
export const clearAllDisplayNames = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CACHE_EXPIRY_KEY);
    displayNamesCache = new Map();
    lastCacheUpdate = 0;
    console.log('Display names cache cleared');
  } catch (error) {
    console.error('Error clearing display names:', error);
  }
};

/**
 * Force refresh of the display names cache
 */
export const refreshDisplayNamesCache = async (): Promise<void> => {
  console.log('Forcing refresh of display names cache');
  clearAllDisplayNames();
  await syncDisplayNamesFromSheets(true);
  
  // Update the last cache update timestamp
  lastCacheUpdate = Date.now();
  console.log('Display names cache refreshed at:', new Date(lastCacheUpdate).toISOString());
};

/**
 * Check if cache needs to be reset due to version change
 */
const checkCacheVersion = (): void => {
  try {
    const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
    if (storedVersion !== CURRENT_CACHE_VERSION) {
      console.log(`Cache version changed (${storedVersion} -> ${CURRENT_CACHE_VERSION}), clearing old data`);
      clearAllDisplayNames();
      localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
    }
  } catch (error) {
    console.error('Error checking cache version:', error);
  }
};

/**
 * Dispatch display name update event with debouncing
 * @param names Updated display names map with optional metadata
 */
const dispatchDisplayNamesUpdate = (names: DisplayNamesUpdateDetail) => {
  // Clear any pending updates for addresses in this update
  Object.keys(names).forEach(address => {
    if (pendingUpdates.has(address)) {
      clearTimeout(pendingUpdates.get(address));
      pendingUpdates.delete(address);
    }
  });

  // Set a new timeout for this update
  const timeoutId = setTimeout(() => {
    window.dispatchEvent(new CustomEvent('displayNamesUpdated', {
      detail: { 
        displayNames: {
          ...names,
          __timestamp: Date.now()
        }
      }
    }));
    
    // Clean up the pending update
    Object.keys(names).forEach(address => {
      pendingUpdates.delete(address);
    });
  }, DEBOUNCE_DELAY);

  // Store the timeout ID for each address in this update
  Object.keys(names).forEach(address => {
    if (address !== '__forceRefresh' && address !== '__updatedAddress' && address !== '__timestamp') {
      pendingUpdates.set(address, timeoutId);
    }
  });
};

/**
 * Load display names from localStorage
 */
const loadDisplayNamesFromStorage = (): Map<string, string> => {
  try {
    // Check cache version first
    checkCacheVersion();
    
    const storedNames = localStorage.getItem(STORAGE_KEY);
    if (!storedNames) return new Map();
    
    const parsedNames = JSON.parse(storedNames) as Record<string, string>;
    
    // Filter out any old fallback names that might be cached
    const knownFallbacks = ['Jack', 'Daniel', 'Mary'];
    Object.keys(parsedNames).forEach(key => {
      if (knownFallbacks.includes(parsedNames[key])) {
        console.log(`Removing obsolete fallback display name "${parsedNames[key]}" for ${key}`);
        delete parsedNames[key];
      }
    });
    
    return new Map(Object.entries(parsedNames));
  } catch (error) {
    console.error('Error loading display names from localStorage:', error);
    return new Map();
  }
};

// Immediately run this once at import time to clean up any cached fallback display names
(function cleanupOldFallbacks() {
  try {
    const storedNames = localStorage.getItem(STORAGE_KEY);
    if (storedNames) {
      const parsedNames = JSON.parse(storedNames) as Record<string, string>;
      const knownFallbacks = ['Jack', 'Daniel', 'Mary'];
      let changed = false;
      
      Object.keys(parsedNames).forEach(key => {
        if (knownFallbacks.includes(parsedNames[key])) {
          console.log(`[startup] Removing obsolete fallback display name "${parsedNames[key]}" for ${key}`);
          delete parsedNames[key];
          changed = true;
        }
      });
      
      if (changed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedNames));
        console.log('[startup] Cleaned up old fallback display names in cache');
      }
    }
  } catch (e) {
    // Ignore errors during cleanup
  }
})();

/**
 * Save display names to localStorage
 */
const saveDisplayNamesToStorage = (names: Map<string, string>): void => {
  try {
    const nameObj = Object.fromEntries(names);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nameObj));
    
    // Set the cache expiry timestamp
    localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_EXPIRY_TIME).toString());
  } catch (error) {
    console.error('Error saving display names to localStorage:', error);
  }
};

/**
 * Check if we're in error cooldown period
 */
const isInErrorCooldown = (): boolean => {
  try {
    const cooldownEndTimeStr = localStorage.getItem(ERROR_COOLDOWN_KEY);
    if (!cooldownEndTimeStr) return false;
    
    const cooldownEndTime = parseInt(cooldownEndTimeStr, 10);
    return Date.now() < cooldownEndTime;
  } catch (error) {
    return false;
  }
};

/**
 * Set error cooldown to prevent excessive retries
 */
const setErrorCooldown = (): void => {
  try {
    localStorage.setItem(ERROR_COOLDOWN_KEY, (Date.now() + ERROR_COOLDOWN_TIME).toString());
  } catch (error) {
    console.error('Error setting error cooldown:', error);
  }
};

/**
 * Check if the display names cache needs refreshing
 */
const shouldRefreshCache = (): boolean => {
  try {
    // If in error cooldown, don't refresh
    if (isInErrorCooldown()) return false;
    
    const expiryTimeStr = localStorage.getItem(CACHE_EXPIRY_KEY);
    if (!expiryTimeStr) return true;
    
    const expiryTime = parseInt(expiryTimeStr, 10);
    return Date.now() > expiryTime;
  } catch (error) {
    return true;
  }
};

/**
 * Sync display names from Google Sheets to localStorage
 * @param force If true, bypass the cache check
 * @returns A promise that resolves when the sync is complete
 */
export const syncDisplayNamesFromSheets = async (force = false): Promise<void> => {
  // Initialize cache from localStorage if empty
  if (displayNamesCache.size === 0) {
    displayNamesCache = loadDisplayNamesFromStorage();
  }
  
  // Don't sync if already in progress
  if (isSyncInProgress) return;
  
  // Skip sync if cache is valid, in error cooldown, and not forced
  if (!force && (!shouldRefreshCache() || isInErrorCooldown())) {
    console.log('Using cached display names, skipping sync');
    return;
  }
  
  try {
    isSyncInProgress = true;
    console.log('Syncing display names from Google Sheets...');
    
    const fetchedNames = await displayNames.getAll();
    
    // Create a new cache with the fetched names
    const newCache = new Map<string, string>();
    
    // Add fetched names 
    fetchedNames.forEach((entry: DisplayNameMapping) => {
      if (entry.walletAddress && entry.displayName) {
        newCache.set(entry.walletAddress, entry.displayName);
      }
    });
    
    // Update the in-memory cache
    displayNamesCache = newCache;
    
    // Save to localStorage
    saveDisplayNamesToStorage(displayNamesCache);
    
    // Notify components of the update
    dispatchDisplayNamesUpdate(Object.fromEntries(displayNamesCache));
    
    console.log(`Synced ${displayNamesCache.size} display names`);
  } catch (error) {
    console.error('Error syncing display names:', error);
    // Set error cooldown to prevent excessive retries
    setErrorCooldown();
  } finally {
    isSyncInProgress = false;
  }
};

/**
 * Format a wallet address for display (shortened)
 */
export const formatWalletAddress = (address: string): string => {
  if (!address) return '';
  if (address.length <= 10) return address;
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

// Record that an address was recently updated
export const markAddressAsUpdated = (address: string): void => {
  recentlyUpdatedAddresses.add(address);
  // Clear from the "recently updated" list after 30 seconds
  setTimeout(() => {
    recentlyUpdatedAddresses.delete(address);
    console.log(`Removed ${address} from recently updated list`);
  }, 30000);
  console.log(`Marked ${address} as recently updated, will force fetch for 30 seconds`);
};

/**
 * Process a batch of pending address lookups
 */
const processPendingBatch = async () => {
  if (pendingAddressQueue.length === 0) return;
  
  const batchAddresses = pendingAddressQueue.splice(0, Math.min(pendingAddressQueue.length, BATCH_SIZE_LIMIT));
  console.log(`[DisplayNames] Processing batch of ${batchAddresses.length} addresses`);
  
  try {
    cacheMetrics.networkRequests++;
    
    // Make a single network request for all addresses in the batch
    const response = await displayNames.getMultipleDisplayNames(batchAddresses);
    const results = response.data?.displayNames || {};
    
    // Process results and resolve pending promises
    for (const address of batchAddresses) {
      const name = results[address] || null;
      const pendingPromise = pendingPromises.get(address);
      
      if (pendingPromise) {
        pendingPromise.resolve(name);
        pendingPromises.delete(address);
        
        // Also update cache if we got a valid name
        if (name) {
          displayNamesCache.set(address, name);
        }
      }
    }
  } catch (error) {
    console.error('[DisplayNames] Batch processing error:', error);
    
    // Reject all pending promises for this batch
    for (const address of batchAddresses) {
      const pendingPromise = pendingPromises.get(address);
      if (pendingPromise) {
        pendingPromise.reject(error as Error);
        pendingPromises.delete(address);
      }
    }
  }
  
  // Process next batch if there are more pending addresses
  if (pendingAddressQueue.length > 0) {
    batchProcessingTimeout = setTimeout(processPendingBatch, BATCH_UPDATE_DELAY);
  } else {
    batchProcessingTimeout = null;
  }
};

/**
 * Queue an address for batch processing
 */
const queueAddressForBatch = (address: string): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    // Store the promise resolution functions
    pendingPromises.set(address, { resolve, reject });
    
    // Add to queue
    pendingAddressQueue.push(address);
    
    // Start batch processing if not already scheduled
    if (!batchProcessingTimeout) {
      batchProcessingTimeout = setTimeout(processPendingBatch, BATCH_UPDATE_DELAY);
    }
  });
};

/**
 * Get the display name for a wallet address
 * @param address The wallet address to get a display name for
 * @returns The display name or null if none exists
 */
export const getDisplayNameForWallet = async (address: string): Promise<string | null> => {
  if (!address) return null;
  
  try {
    // Check if it's in memory cache first
    if (displayNamesCache.has(address)) {
      // If it was recently updated, don't use cache
      if (recentlyUpdatedAddresses.has(address)) {
        cacheMetrics.staleHits++;
        recentlyUpdatedAddresses.delete(address);
      } else {
        cacheMetrics.hits++;
        logMetrics();
        return displayNamesCache.get(address) || null;
      }
    } else {
      cacheMetrics.misses++;
    }
    
    // Sync from sheets first if needed and not in error cooldown
    // This ensures we have the latest data
    if (shouldRefreshCache() && !isSyncInProgress && !isInErrorCooldown()) {
      await syncDisplayNamesFromSheets();
      
      // Check if the name is now in cache after sync
      if (displayNamesCache.has(address)) {
        return displayNamesCache.get(address) || null;
      }
    }
    
    // Not in cache or stale, queue it for batch processing
    return await queueAddressForBatch(address);
  } catch (error) {
    console.error(`Error getting display name for wallet ${address}:`, error);
    return null;
  }
};

/**
 * Set the display name for a wallet address
 * @param address The wallet address to set the display name for
 * @param name The display name to associate with the wallet address
 */
export const setDisplayNameForWallet = async (address: string, name: string): Promise<boolean> => {
  if (!address || !name) return false;
  
  try {
    console.log(`Setting display name for ${address} to "${name}"`);
    
    // Update local cache first for immediate feedback
    displayNamesCache.set(address, name);
    saveDisplayNamesToStorage(displayNamesCache);
    
    // Notify components of the immediate update
    dispatchDisplayNamesUpdate({
      [address]: name,
      __updatedAddress: address
    });
    
    // Mark this address as requiring server fetch
    markAddressAsUpdated(address);
    
    // Update on the server
    await displayNames.update(address, name);
    console.log(`Server-side update completed for ${address}`);
    
    // Force a complete cache refresh after server update
    await refreshDisplayNamesCache();
    
    // Final update notification with force refresh flag
    dispatchDisplayNamesUpdate({
      [address]: name,
      __forceRefresh: true,
      __updatedAddress: address
    });
    
    console.log(`Display name for ${address} has been set to "${name}" and cache has been refreshed`);
    return true;
  } catch (error) {
    console.error('Error setting display name:', error);
    // Revert local cache if server update failed
    await refreshDisplayNamesCache();
    return false;
  }
};

/**
 * Get all stored display names
 * @returns A map of wallet addresses to display names
 */
export const getAllDisplayNames = (): Map<string, string> => {
  // Initialize cache from localStorage if empty
  if (displayNamesCache.size === 0) {
    displayNamesCache = loadDisplayNamesFromStorage();
  }
  
  return displayNamesCache;
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