// API Base Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const CONFIG_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Collection Types
export interface Collection {
  address: string;
  name: string;
  collectionId: string;
  firstNftDate?: string;
  createdAt?: string;
  image?: string;
  description?: string;
  addedAt?: number;
  creationDate?: string;
  ultimates?: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface CollectionApiResponse extends ApiResponse<never> {
  collections: Collection[];
  length: number;
  sample?: Collection;
}

// Display Name Types
export interface DisplayNameMapping {
  walletAddress: string;
  displayName: string;
}

// Market Types
export interface MarketListing {
  nftAddress: string;
  name: string;
  description: string;
  image: string;
  price: number;
  seller: string;
  createdAt: string;
  collectionName: string;
  collectionAddress: string;
}

export interface MarketStats {
  totalListings: number;
  totalVolume: number;
  averagePrice: number;
}

// Transaction Types
export interface MintNFTData {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  collection: string;
}

export interface ListNFTData {
  nftAddress: string;
  price: number;
}

export interface PurchaseNFTData {
  nftAddress: string;
  price: number;
  seller: string;
} 