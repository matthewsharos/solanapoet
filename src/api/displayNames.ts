import { GOOGLE_SHEETS_CONFIG, get } from './googleSheetsConfig';
import { API_BASE_URL } from './config';

export interface DisplayName {
  wallet_address: string;
  display_name: string;
}

// Cache management
let displayNamesCache: DisplayName[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // Increased to 30 seconds
const FETCH_COOLDOWN = 2000; // 2 second cooldown between fetches
let lastFetchTime = 0;
let fetchPromise: Promise<DisplayName[]> | null = null;

interface SheetEntry {
  wallet_address: string;
  display_name: string;
}

// Keep track of pending updates
let isUpdating = false;
let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 2000; // 2 second cooldown between updates

const clearCache = () => {
  console.log('Clearing display names cache...');
  displayNamesCache = null;
  lastCacheTime = 0;
  localStorage.removeItem('wallet_display_names');
};

export const getDisplayNames = async (bypassCache = false): Promise<DisplayName[]> => {
  const now = Date.now();

  // If there's an ongoing fetch, wait for it
  if (fetchPromise) {
    return fetchPromise;
  }

  // Return cached data if valid and not bypassing
  if (!bypassCache && displayNamesCache && (now - lastCacheTime) < CACHE_TTL) {
    return displayNamesCache;
  }

  // Respect fetch cooldown
  if (now - lastFetchTime < FETCH_COOLDOWN && !bypassCache) {
    return displayNamesCache || [];
  }

  try {
    lastFetchTime = now;
    const promise = async (): Promise<DisplayName[]> => {
      const response = await get(GOOGLE_SHEETS_CONFIG.sheets.displayNames);

      if (!response?.success) {
        console.error('Failed to fetch display names:', response?.error);
        return displayNamesCache || [];
      }

      // The data comes as an array of arrays where first row is headers
      const rows = response.data;
      console.log('Raw response data:', rows);

      if (!Array.isArray(rows) || rows.length < 2) {
        console.log('No valid data rows found');
        return displayNamesCache || [];
      }

      // Skip header row and convert array data to DisplayName objects
      // Maintain case sensitivity - no toLowerCase()
      const newData = rows.slice(1).map(row => {
        const entry = {
          wallet_address: (row[0] || '').trim(),
          display_name: (row[1] || '').trim()
        };
        console.log('Processing row:', { row, entry });
        return entry;
      }).filter(entry => entry.wallet_address && entry.display_name);

      // Only update cache if we got valid data
      if (newData.length > 0) {
        console.log('Updating display names cache with:', newData);
        displayNamesCache = newData;
        lastCacheTime = now;

        // Update localStorage with case-sensitive addresses
        const namesMap: Record<string, string> = {};
        newData.forEach((entry: DisplayName) => {
          namesMap[entry.wallet_address] = entry.display_name;
        });
        localStorage.setItem('wallet_display_names', JSON.stringify(namesMap));
      }

      return displayNamesCache || [];
    };

    fetchPromise = promise();
    const result = await fetchPromise;
    fetchPromise = null;
    return result;
  } catch (error) {
    console.error('Error fetching display names:', error);
    fetchPromise = null;
    return displayNamesCache || [];
  }
};

// Simplified display name lookup that doesn't trigger unnecessary fetches
export const getDisplayName = async (walletAddress: string): Promise<string | null> => {
  if (!walletAddress) return null;
  
  console.log('Looking up display name for address:', walletAddress); // Debug log
  
  // First check cache/localStorage
  const storedNames = localStorage.getItem('wallet_display_names');
  if (storedNames) {
    try {
      const namesMap = JSON.parse(storedNames);
      console.log('Cached display names:', namesMap); // Debug log
      // Use exact case-sensitive match
      if (namesMap[walletAddress]) {
        console.log('Found cached display name:', namesMap[walletAddress]); // Debug log
        return namesMap[walletAddress];
      }
    } catch (e) {
      console.error('Error parsing stored display names:', e);
    }
  }
  
  // If not found in cache, fetch fresh data
  console.log('No cached display name found, fetching fresh data...'); // Debug log
  const displayNames = await getDisplayNames(true); // Force bypass cache to get fresh data
  console.log('Fetched display names:', displayNames); // Debug log
  
  // Use exact case-sensitive match
  const match = displayNames.find(entry => {
    const entryMatches = entry.wallet_address === walletAddress;
    console.log('Comparing:', {
      entry: entry.wallet_address,
      walletAddress,
      matches: entryMatches,
      displayName: entry.display_name
    });
    return entryMatches;
  });
  
  console.log('Display name match result:', match); // Debug log
  return match ? match.display_name : null;
};

/**
 * Update or add a display name for a wallet address
 */
export const updateDisplayName = async (walletAddress: string, displayName: string): Promise<boolean> => {
  try {
    console.log('Updating display name:', { walletAddress, displayName });
    
    // Clear cache before update
    clearCache();
    
    const response = await fetch(`${API_BASE_URL}/api/display-names/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ walletAddress, displayName }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update display name');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to update display name');
    }

    // Mark update time
    lastUpdateTime = Date.now();

    // Force fresh data fetch
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to ensure Google Sheets has updated
    const updatedNames = await getDisplayNames(true);
    
    // Update localStorage
    const namesMap: Record<string, string> = {};
    updatedNames.forEach(entry => {
      if (entry && entry.wallet_address && entry.display_name) {
        namesMap[entry.wallet_address] = entry.display_name;
      }
    });
    
    localStorage.setItem('wallet_display_names', JSON.stringify(namesMap));

    // Notify components
    window.dispatchEvent(new CustomEvent('displayNamesUpdated', {
      detail: { displayNames: namesMap }
    }));

    console.log('Display name updated successfully:', namesMap);
    return true;
  } catch (error) {
    console.error('Error updating display name:', error);
    throw error;
  }
};

// Note: updateDisplayName functionality has been moved to the server-side
// since it requires write access to Google Sheets 