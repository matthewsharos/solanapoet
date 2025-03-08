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
const CURRENT_CACHE_VERSION = '1.2'; // Incremented to force cache refresh

// Cache display names in memory
let displayNamesCache: Map<string, string> = new Map();
let isSyncInProgress = false;
let lastCacheUpdate = 0;

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
 * Dispatch display name update event
 * @param names Updated display names map with optional metadata
 */
const dispatchDisplayNamesUpdate = (names: DisplayNamesUpdateDetail) => {
  window.dispatchEvent(new CustomEvent('displayNamesUpdated', {
    detail: { displayNames: names }
  }));
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

/**
 * Get the display name for a wallet address
 * @param address The wallet address to get the display name for
 * @returns The display name if found, null otherwise
 */
export const getDisplayNameForWallet = async (address: string): Promise<string | null> => {
  if (!address) return null;
  
  // Initialize cache from localStorage if empty
  if (displayNamesCache.size === 0) {
    displayNamesCache = loadDisplayNamesFromStorage();
  }
  
  // Check cache first
  const cachedName = displayNamesCache.get(address);
  if (cachedName) {
    return cachedName;
  }
  
  // Only try to fetch from API if we're not in the error cooldown period
  if (!isInErrorCooldown()) {
    try {
      // Try a direct fetch for this address
      const name = await displayNames.get(address);
      if (name) {
        displayNamesCache.set(address, name);
        saveDisplayNamesToStorage(displayNamesCache);
        return name;
      }
    } catch (error) {
      console.error('Error fetching display name:', error);
      setErrorCooldown();
    }
  }
  
  // Trigger a sync for future requests, but don't wait for it
  syncDisplayNamesFromSheets(false).catch(() => {});
  
  return null;
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
    
    // Update on the server
    await displayNames.update(address, name);
    console.log(`Server-side update completed for ${address}`);
    
    // Force a complete cache refresh
    await refreshDisplayNamesCache();
    
    // Also update the specific entry in case it's not in the refreshed data
    displayNamesCache.set(address, name);
    saveDisplayNamesToStorage(displayNamesCache);
    
    // Notify components of the update with special flag
    const displayNamesObject = Object.fromEntries(displayNamesCache);
    dispatchDisplayNamesUpdate({
      ...displayNamesObject,
      __forceRefresh: true, // Add special flag for components to clear their local state
      __updatedAddress: address,
      __timestamp: Date.now()
    });
    
    console.log(`Display name for ${address} has been set to "${name}" and cache has been refreshed`);
    return true;
  } catch (error) {
    console.error('Error setting display name:', error);
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