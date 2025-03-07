declare module '../api/collections' {
  export interface Collection {
    address: string;
    name: string;
    image?: string;
    description?: string;
    addedAt?: number;
    creationDate?: string;
    ultimates?: boolean;
    collectionId?: string;
  }

  export function fetchCollections(): Promise<Collection[]>;
  export function addCollection(collection: Collection): Promise<void>;
  export function removeCollection(address: string): Promise<void>;
  export function updateCollection(collection: Collection): Promise<void>;
  export function updateCollectionUltimates(address: string, ultimates: boolean): Promise<void>;
  export function getCollection(address: string): Promise<Collection | null>;
}

declare module '../api/displayNames' {
  export interface DisplayNameMapping {
    wallet_address: string;
    display_name: string;
    updated_at?: string;
  }

  export function getDisplayName(address: string): Promise<string | null>;
  export function getDisplayNames(): Promise<DisplayNameMapping[]>;
  export function updateDisplayName(address: string, name: string): Promise<void>;
}

declare module '../api/marketplace' {
  export function getApiBaseUrl(): Promise<string>;
}

declare module '../api/mint/collections' {
  export function fetchCollections(): Promise<Collection[]>;
  export function addCollection(collection: Collection): Promise<void>;
  export function removeCollection(address: string): Promise<void>;
  export function updateCollection(collection: Collection): Promise<void>;
}

declare module '../api/mint/transactions' {
  export function mintNFT(data: any): Promise<any>;
}

declare module '../api/market/listings' {
  export function fetchListings(): Promise<any[]>;
  export function fetchMarketStats(): Promise<any>;
}

declare module '../api/market/transactions' {
  export function listNFT(data: any): Promise<any>;
  export function purchaseNFT(data: any): Promise<any>;
}

declare module '../api/config' {
  export const API_BASE_URL: string;
  export const CONFIG_API_URL: string;
} 