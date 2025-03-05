import { createSheetsClient, GOOGLE_SHEETS_CONFIG, convertSheetDataToObjects } from './googleSheetsConfig';
import { normalizeAddress } from '../utils/displayNames';

// Function to get display names from Google Sheets
export async function getDisplayNames(): Promise<Record<string, string>> {
  try {
    const sheetsClient = await createSheetsClient();
    
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`
    });

    const data = convertSheetDataToObjects(response.data.values || [], ['wallet_address', 'display_name']);
    
    // Convert array of objects to Record<string, string>
    const displayNames: Record<string, string> = {};
    data.forEach(item => {
      if (item.wallet_address && item.display_name) {
        // Store with normalized address
        displayNames[normalizeAddress(item.wallet_address)] = item.display_name;
      }
    });

    return displayNames;
  } catch (error) {
    console.error('Error fetching display names:', error);
    return {};
  }
}

// Function to update display name
export async function updateDisplayName(walletAddress: string, displayName: string): Promise<boolean> {
  try {
    const sheetsClient = await createSheetsClient();
    
    // First get all records to check if wallet exists
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`
    });

    const data = convertSheetDataToObjects(response.data.values || [], ['wallet_address', 'display_name']);
    const normalizedWalletAddress = normalizeAddress(walletAddress);
    const existingRecordIndex = data.findIndex(item => normalizeAddress(item.wallet_address) === normalizedWalletAddress);

    if (existingRecordIndex === -1) {
      // Add new record
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A:B`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]] // Store original address format but match on normalized
        }
      });
    } else {
      // Update existing record
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: `${GOOGLE_SHEETS_CONFIG.sheets.displayNames}!A${existingRecordIndex + 2}:B${existingRecordIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[walletAddress, displayName]] // Store original address format but match on normalized
        }
      });
    }

    return true;
  } catch (error) {
    console.error('Error updating display name:', error);
    return false;
  }
} 