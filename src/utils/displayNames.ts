/**
 * Utility functions for working with wallet display names
 * These names are stored in localStorage for persistence
 */

import { displayNames } from '../api/client';
import type { DisplayNameMapping } from '../types/api';

const STORAGE_KEY = 'wallet_display_names';
let syncInProgress = false;
let syncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Event name constant to ensure consistency
const DISPLAY_NAMES_UPDATED_EVENT = 'displayNamesUpdated';

// Cache display names in memory
let displayNamesCache: Map<string, string> = new Map();

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
export const syncDisplayNamesFromSheets = async (force = false): Promise<void> => {
  const now = Date.now();
  if (!force && now - lastSyncTime < SYNC_COOLDOWN) {
    console.log('Skipping sync due to cooldown');
    return;
  }

  try {
    const fetchedNames = await displayNames.getAll();
    const newCache = new Map<string, string>();

    fetchedNames.forEach((entry: DisplayNameMapping) => {
      newCache.set(entry.walletAddress.toLowerCase(), entry.displayName);
    });

    displayNamesCache = newCache;
    lastSyncTime = now;

    // Dispatch event to notify components
    const event = new CustomEvent('displayNamesUpdated', {
      detail: {
        displayNames: Object.fromEntries(displayNamesCache),
      },
    });
    window.dispatchEvent(event);
  } catch (error) {
    console.error('Error syncing display names:', error);
  }
};

/**
 * Get the display name for a wallet address
 * @param walletAddress The wallet address to get the display name for
 * @returns The display name if found, undefined otherwise
 */
export const getDisplayNameForWallet = async (address: string): Promise<string | null> => {
  // Check cache first
  const cachedName = displayNamesCache.get(address.toLowerCase());
  if (cachedName) {
    return cachedName;
  }

  try {
    const name = await displayNames.get(address);
    if (name) {
      displayNamesCache.set(address.toLowerCase(), name);
    }
    return name;
  } catch (error) {
    console.error('Error fetching display name:', error);
    return null;
  }
};

/**
 * Set the display name for a wallet address
 * @param walletAddress The wallet address to set the display name for
 * @param displayName The display name to associate with the wallet address
 */
export const setDisplayNameForWallet = async (address: string, name: string): Promise<boolean> => {
  try {
    await displayNames.update(address, name);
    displayNamesCache.set(address.toLowerCase(), name);
    return true;
  } catch (error) {
    console.error('Error setting display name:', error);
    return false;
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