import { sheets, createSheetsClient, GOOGLE_SHEETS_CONFIG, getSheetRange, convertSheetDataToObjects, convertObjectsToSheetData } from './googleSheetsConfig';

/**
 * Type definition for a collection
 */
export type Collection = {
  address: string;
  name: string;
  image?: string;
  description?: string;
  addedAt: number;
  creationDate?: string; // ISO string date when the collection was first created on-chain
  ultimates: string | boolean; // Can be 'TRUE', true, false, or undefined
};

// Add new type for ultimate NFT entries
export type UltimateNFT = {
  collection_id: string;
  nft_address: string;
  name?: string;
  owner?: string;
};

// Timeout for fetch requests in milliseconds
const FETCH_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second delay between retries

/**
 * Sleep utility function
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get collections from localStorage
 */
const getLocalStorageCollections = (): Collection[] => {
  try {
    const storedCollections = localStorage.getItem('collections');
    if (!storedCollections) return [];
    const collections = JSON.parse(storedCollections);
    console.log('Retrieved collections from localStorage:', collections.length);
    return collections;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return [];
  }
};

/**
 * Ensure Google Sheets client is initialized
 */
const ensureSheetsClient = async () => {
  if (!sheets) {
    console.log('Sheets client not initialized, creating new client...');
    const newClient = await createSheetsClient();
    return newClient;
  }
  return sheets;
};

/**
 * Fetch collections from Google Sheets with retry logic
 */
const fetchFromGoogleSheets = async (retries = MAX_RETRIES): Promise<Collection[]> => {
  try {
    console.log('Fetching collections from Google Sheets...');
    
    const sheetsClient = await ensureSheetsClient();
    
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    // Handle both wrapped and unwrapped response formats
    const values = response.data?.values || response?.values || [];
    const data = convertSheetDataToObjects(values);
    console.log('Successfully fetched collections from Google Sheets:', data.length);

    // Map the Google Sheets data to our Collection type
    const collections = data.map(item => ({
      address: item.address || '',
      name: item.name || '',
      image: item.image || '',
      description: item.description || '',
      addedAt: item.addedAt ? parseInt(item.addedAt) : Date.now(),
      creationDate: item.creationDate || '',
      ultimates: item.ultimates === 'TRUE'
    }));

    // Cache in localStorage as backup
    try {
      localStorage.setItem('collections', JSON.stringify(collections));
      console.log('Cached collections in localStorage');
    } catch (e) {
      console.warn('Failed to cache collections in localStorage:', e);
    }

    return collections;
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    if (retries > 0) {
      console.log(`Retrying request, ${retries} attempts remaining...`);
      await sleep(RETRY_DELAY);
      return fetchFromGoogleSheets(retries - 1);
    }
    throw error;
  }
};

/**
 * Fetch collections from Google Sheets or localStorage
 */
export const fetchCollections = async (): Promise<Collection[]> => {
  try {
    return await fetchFromGoogleSheets();
  } catch (error) {
    console.warn('Failed to fetch from Google Sheets, falling back to localStorage:', error);
    const localCollections = getLocalStorageCollections();
    if (localCollections.length > 0) {
      console.log('Successfully retrieved collections from localStorage fallback');
      return localCollections;
    }
    return [];
  }
};

/**
 * Add a collection to Google Sheets
 */
export const addCollection = async (collection: Collection): Promise<boolean> => {
  try {
    if (!collection.address) {
      console.error('Invalid collection: missing address');
      return false;
    }

    // First fetch existing collections to check for duplicates
    const collections = await fetchCollections();
    if (collections.some(c => c.address === collection.address)) {
      console.warn(`Collection with address ${collection.address} already exists`);
      return false;
    }

    const sheetsClient = await ensureSheetsClient();

    // Prepare the data to append
    const values = [[
      collection.address,
      collection.name,
      collection.image || '',
      collection.description || '',
      collection.addedAt.toString(),
      collection.creationDate || '',
      collection.ultimates ? 'TRUE' : ''
    ]];

    // Append to Google Sheets
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
      valueInputOption: 'RAW',
      requestBody: {
        values
      }
    });

    console.log('Successfully added collection to Google Sheets');
    return true;
  } catch (error) {
    console.error('Error adding collection:', error);
    return false;
  }
};

/**
 * Remove a collection by address from Google Sheets
 */
export const removeCollection = async (address: string): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to delete
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Delete the row
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // You'll need to get the actual sheet ID
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    console.log('Successfully removed collection from Google Sheets');
    return true;
  } catch (error) {
    console.error('Error removing collection:', error);
    
    // Fallback to localStorage
    try {
      const collections = await fetchCollections();
      const updatedCollections = collections.filter(c => c.address !== address);
      localStorage.setItem('collections', JSON.stringify(updatedCollections));
      console.log('Removed collection from localStorage as fallback');
      return true;
    } catch (e) {
      console.error('Failed to remove collection from localStorage fallback:', e);
      return false;
    }
  }
};

/**
 * Check if a collection exists by address
 */
export const collectionExists = async (address: string): Promise<boolean> => {
  const collections = await fetchCollections();
  return collections.some(c => c.address === address);
};

/**
 * Update a collection's name and ultimates in Google Sheets
 */
export const updateCollection = async (address: string, name: string, ultimates?: boolean): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to update
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Update both name and ultimates columns
    const nameRange = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!B${rowIndex + 1}`;
    const ultimatesRange = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!G${rowIndex + 1}`;

    // Update name
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: nameRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name]]
      }
    });

    // Update ultimates if provided
    if (ultimates !== undefined) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: ultimatesRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[ultimates ? 'TRUE' : '']]
        }
      });
    }

    console.log('Successfully updated collection in Google Sheets');
    return true;
  } catch (error) {
    console.error('Error updating collection:', error);
    return false;
  }
};

/**
 * Update a collection's ultimates in Google Sheets
 */
export const updateCollectionUltimates = async (address: string, ultimates: string[]): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to update
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => row[0] === address);

    if (rowIndex === -1) {
      console.warn(`Collection with address ${address} not found`);
      return false;
    }

    // Update just the ultimates column (index 7) in the found row
    const range = `${GOOGLE_SHEETS_CONFIG.sheets.collections}!H${rowIndex + 1}`;
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[ultimates.join(',')]]
      }
    });

    console.log('Successfully updated collection ultimates in Google Sheets');
    return true;
  } catch (error) {
    console.error('Error updating collection ultimates:', error);
    return false;
  }
};

/**
 * Get ultimate NFTs for a specific collection from the ultimates sheet
 */
export const getUltimateNFTs = async (collectionAddress: string): Promise<UltimateNFT[]> => {
  try {
    console.log(`[getUltimateNFTs] Fetching ultimate NFTs for collection: ${collectionAddress}`);
    const sheetsClient = await ensureSheetsClient();
    
    // Get all ultimate NFTs
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.ultimates),
    });

    console.log(`[getUltimateNFTs] Raw response from Google Sheets:`, response);
    const values = response.data?.values || response?.values || [];
    console.log(`[getUltimateNFTs] Values from Google Sheets:`, values);
    const data = convertSheetDataToObjects(values);
    console.log(`[getUltimateNFTs] Converted data:`, data);

    // Filter for the requested collection
    const filteredData = data.filter(item => item.collection_id === collectionAddress);
    console.log(`[getUltimateNFTs] Filtered data for collection:`, filteredData);

    const result = filteredData.map(item => ({
      collection_id: item.collection_id,
      nft_address: item['NFT Address'],
      name: item.Name,
      owner: item.Owner
    }));

    console.log(`[getUltimateNFTs] Final result:`, result);
    return result;
  } catch (error) {
    console.error('[getUltimateNFTs] Error fetching ultimate NFTs:', error);
    return [];
  }
};

/**
 * Add an ultimate NFT to the ultimates sheet
 */
export const addUltimateNFT = async (nft: UltimateNFT): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Check if NFT already exists
    const existingNFTs = await getUltimateNFTs(nft.collection_id);
    if (existingNFTs.some(existing => existing.nft_address === nft.nft_address)) {
      console.warn('NFT already exists in ultimates sheet');
      return false;
    }

    // Append the new NFT
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.ultimates),
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          nft.nft_address,
          nft.name || '',
          nft.owner || '',
          nft.collection_id
        ]]
      }
    });

    console.log('Successfully added ultimate NFT to sheet');
    return true;
  } catch (error) {
    console.error('Error adding ultimate NFT:', error);
    return false;
  }
};

/**
 * Remove an ultimate NFT from the ultimates sheet
 */
export const removeUltimateNFT = async (collectionAddress: string, nftAddress: string): Promise<boolean> => {
  try {
    const sheetsClient = await ensureSheetsClient();

    // Get current data to find the row to delete
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.ultimates),
    });

    const data = response.data.values || [];
    const rowIndex = data.findIndex((row: string[]) => 
      row[0] === collectionAddress && row[1] === nftAddress
    );

    if (rowIndex === -1) {
      console.warn('Ultimate NFT not found');
      return false;
    }

    // Delete the row
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // You'll need to get the actual sheet ID
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    console.log('Successfully removed ultimate NFT');
    return true;
  } catch (error) {
    console.error('Error removing ultimate NFT:', error);
    return false;
  }
}; 