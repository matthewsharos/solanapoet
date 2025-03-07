import { GOOGLE_SHEETS_CONFIG, get } from './googleSheetsConfig';

// Types
export interface Collection {
  address: string;
  name: string;
  symbol?: string;
  description?: string;
  image?: string;
}

export interface UltimateNFT {
  "NFT Address": string;
  "Name": string;
  "Owner": string;
  "collection_id": string;
}

export interface DisplayName {
  wallet_address: string;
  display_name: string;
}

export interface ArtRequest {
  request_id: string;
  requester_wallet: string;
  request_type: string;
  description: string;
  status: string;
  created_at: string;
  updated_at?: string;
  assigned_to?: string;
  notes?: string;
}

/**
 * Fetch collections from Google Sheets
 */
export const fetchCollections = async (): Promise<Collection[]> => {
  try {
    const response = await get(GOOGLE_SHEETS_CONFIG.sheets.collections);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data as Collection[];
  } catch (error) {
    console.error('Error fetching collections:', error);
    return [];
  }
};

/**
 * Get ultimate NFTs from Google Sheets
 */
export const getUltimateNFTs = async (): Promise<UltimateNFT[]> => {
  try {
    const response = await get(GOOGLE_SHEETS_CONFIG.sheets.ultimates);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data as UltimateNFT[];
  } catch (error) {
    console.error('Error fetching ultimate NFTs:', error);
    return [];
  }
};

/**
 * Get display names from Google Sheets
 */
export const getDisplayNames = async (): Promise<DisplayName[]> => {
  try {
    const response = await get(GOOGLE_SHEETS_CONFIG.sheets.displayNames);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data as DisplayName[];
  } catch (error) {
    console.error('Error fetching display names:', error);
    return [];
  }
};

/**
 * Get art requests from Google Sheets
 */
export const getArtRequests = async (): Promise<ArtRequest[]> => {
  try {
    const response = await get(GOOGLE_SHEETS_CONFIG.sheets.artRequests);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data as ArtRequest[];
  } catch (error) {
    console.error('Error fetching art requests:', error);
    return [];
  }
}; 