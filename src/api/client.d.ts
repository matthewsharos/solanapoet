import { Collection, DisplayNameMapping, MarketListing, MarketStats, MintNFTData, ListNFTData, PurchaseNFTData } from '../types/api';

export const API_BASE_URL: string;

export const collections: {
  fetch: () => Promise<Collection[]>;
  add: (collection: Collection) => Promise<void>;
  remove: (address: string) => Promise<void>;
  update: (collection: Collection) => Promise<void>;
  updateUltimates: (address: string, ultimates: boolean) => Promise<void>;
  get: (address: string) => Promise<Collection | null>;
};

export const displayNames: {
  get: (address: string) => Promise<string | null>;
  getAll: () => Promise<DisplayNameMapping[]>;
  update: (address: string, name: string) => Promise<void>;
};

export const market: {
  listings: {
    fetch: () => Promise<MarketListing[]>;
    stats: () => Promise<MarketStats>;
  };
  transactions: {
    list: (data: ListNFTData) => Promise<void>;
    purchase: (data: PurchaseNFTData) => Promise<void>;
  };
};

export const mint: {
  nft: (data: MintNFTData) => Promise<void>;
}; 