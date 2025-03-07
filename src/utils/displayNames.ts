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

// Fallback display names in case the API fails
const FALLBACK_DISPLAY_NAMES: Record<string, string> = {
  "ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD": "DegenPoet",
  "CknhwzE3kKYFN24BapMeaWekCE9Fnj6dpGnRHJN2yWd7": "Jack",
  "CoPufhAobbD9ChXEcZoUbEHPiJF3xvQ1JNXDf9cmh3xz": "Daniel",
  "HhLJA5EWvJygtKksWp9xGYFYgdSdtrz4Mpd1VhPzC5Ae": "Mary"
};

// Cache display names in memory
let displayNamesCache: Map<string, string> = new Map();
let isSyncInProgress = false;

/**
 * Dispatch display name update event
 * @param names Updated display names map
 */
const dispatchDisplayNamesUpdate = (names: Record<string, string>) => {
  window.dispatchEvent(new CustomEvent('displayNamesUpdated', {
    detail: { displayNames: names }
  }));
};

/**
 * Load display names from localStorage
 */
const loadDisplayNamesFromStorage = (): Map<string, string> => {
  try {
    const storedNames = localStorage.getItem(STORAGE_KEY);
    if (!storedNames) return new Map(Object.entries(FALLBACK_DISPLAY_NAMES));
    
    const parsedNames = JSON.parse(storedNames) as Record<string, string>;
    return new Map(Object.entries(parsedNames));
  } catch (error) {
    console.error('Error loading display names from localStorage:', error);
    return new Map(Object.entries(FALLBACK_DISPLAY_NAMES));
  }
};

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
    
    // First add all fallback names to ensure we always have them
    Object.entries(FALLBACK_DISPLAY_NAMES).forEach(([address, name]) => {
      newCache.set(address, name);
    });
    
    // Then add any fetched names, which will override fallbacks if duplicates exist
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
    
    // Use fallback data from localStorage or fallback object
    if (displayNamesCache.size === 0) {
      displayNamesCache = new Map(Object.entries(FALLBACK_DISPLAY_NAMES));
      saveDisplayNamesToStorage(displayNamesCache);
    }
    
    // Still notify components with what we have
    dispatchDisplayNamesUpdate(Object.fromEntries(displayNamesCache));
  } finally {
    isSyncInProgress = false;
  }
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
  
  // Check fallback data
  const fallbackName = FALLBACK_DISPLAY_NAMES[address];
  if (fallbackName) {
    // Add to cache for future use
    displayNamesCache.set(address, fallbackName);
    saveDisplayNamesToStorage(displayNamesCache);
    return fallbackName;
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
    // Update on the server
    await displayNames.update(address, name);
    
    // Update in the local cache
    displayNamesCache.set(address, name);
    
    // Save to localStorage
    saveDisplayNamesToStorage(displayNamesCache);
    
    // Notify components of the update
    dispatchDisplayNamesUpdate(Object.fromEntries(displayNamesCache));
    
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