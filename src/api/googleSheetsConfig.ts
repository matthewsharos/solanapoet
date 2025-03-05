// Configuration
export const GOOGLE_SHEETS_CONFIG = {
  // Google Sheet ID - this should be set from environment variable
  spreadsheetId: import.meta.env?.VITE_GOOGLE_SHEETS_SPREADSHEET_ID,
  // Sheet names
  sheets: {
    collections: 'collections',
    listings: 'listings',
    displayNames: 'display_names',
    artRequests: 'art_requests',
    ultimates: 'ultimates'
  }
};

// Log environment variables for debugging
console.log('Google Sheets Config:', {
  spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
  apiKeyExists: !!import.meta.env.VITE_GOOGLE_API_KEY,
  apiKeyLength: import.meta.env.VITE_GOOGLE_API_KEY?.length
});

// Create Google Sheets client for browser environment
export const createSheetsClient = async () => {
  // For browser environment, we'll use a backend proxy endpoint
  const BASE_URL = '/api/sheets'; // This will be proxied to your backend

  return {
    spreadsheets: {
      values: {
        get: async ({ spreadsheetId, range }: { spreadsheetId: string, range: string }) => {
          const url = `${BASE_URL}/values/${spreadsheetId}/${encodeURIComponent(range)}`;
          console.log('Fetching from URL:', url);
          
          try {
            const response = await fetch(url);
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Failed to fetch sheet data: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
            }
            return response.json();
          } catch (error) {
            console.error('Detailed fetch error:', error);
            throw error;
          }
        },
        append: async ({ spreadsheetId, range, valueInputOption, requestBody }: any) => {
          const url = `${BASE_URL}/values/${spreadsheetId}/${encodeURIComponent(range)}/append`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              valueInputOption,
              values: requestBody.values
            }),
          });
          if (!response.ok) {
            throw new Error(`Failed to append sheet data: ${response.statusText}`);
          }
          return response.json();
        },
        update: async ({ spreadsheetId, range, valueInputOption, requestBody }: any) => {
          const url = `${BASE_URL}/values/${spreadsheetId}/${encodeURIComponent(range)}`;
          const response = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              valueInputOption,
              values: requestBody.values
            }),
          });
          if (!response.ok) {
            throw new Error(`Failed to update sheet data: ${response.statusText}`);
          }
          return response.json();
        }
      },
      batchUpdate: async ({ spreadsheetId, requestBody }: any) => {
        const url = `${BASE_URL}/batch/${spreadsheetId}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          throw new Error(`Failed to batch update: ${response.statusText}`);
        }
        return response.json();
      }
    }
  };
};

// Export sheets client
export let sheets: any = null;

// Initialize sheets client
(async () => {
  try {
    sheets = await createSheetsClient();
    console.log('Google Sheets client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Google Sheets client:', error);
  }
})();

// Helper function to get sheet range
export const getSheetRange = (sheetName: string, range?: string) => {
  return `${sheetName}${range ? '!' + range : ''}`;
};

// Helper function to convert sheet data to objects
export const convertSheetDataToObjects = (data: any[][], customHeaders?: string[]): any[] => {
  if (!data || data.length < 2) return [];
  
  const headers = customHeaders || data[0];
  return data.slice(1).map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
};

// Helper function to convert objects to sheet data
export const convertObjectsToSheetData = (objects: any[]): any[][] => {
  if (!objects || objects.length === 0) return [[]];
  
  const headers = Object.keys(objects[0]);
  const rows = objects.map(obj => headers.map(header => obj[header]));
  
  return [headers, ...rows];
};

// Test function to verify sheet access
export const testGoogleSheetsConnection = async () => {
  try {
    console.log('Testing Google Sheets connection...');
    const sheetsClient = await createSheetsClient();

    // Test Collections sheet
    console.log('Testing Collections sheet access...');
    const collectionsResponse = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.collections),
    });
    
    console.log('Collections data:', {
      headers: collectionsResponse.values?.[0] || [],
      rowCount: (collectionsResponse.values || []).length - 1
    });

    // Test Display_Names sheet
    console.log('Testing Display_Names sheet access...');
    const displayNamesResponse = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: getSheetRange(GOOGLE_SHEETS_CONFIG.sheets.displayNames),
    });
    
    console.log('Display_Names data:', {
      headers: displayNamesResponse.values?.[0] || [],
      rowCount: (displayNamesResponse.values || []).length - 1
    });

    console.log('Google Sheets connection test completed successfully');
    return true;
  } catch (error) {
    console.error('Google Sheets connection test failed:', error);
    return false;
  }
}; 