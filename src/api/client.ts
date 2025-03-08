import { Collection, CollectionApiResponse, DisplayNameMapping, MarketListing, MarketStats, MintNFTData, ListNFTData, PurchaseNFTData } from '../types/api';

// Use window.location.origin in the browser to ensure correct URL in production
export const API_BASE_URL = typeof window !== 'undefined' 
  ? window.location.origin 
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

// Collections API
export const collections = {
  fetch: async (): Promise<Collection[]> => {
    const response = await fetch(`${API_BASE_URL}/api/collection`);
    const data = await response.json() as CollectionApiResponse;
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch collections');
    }
    return data.collections;
  },

  add: async (collection: Collection): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to add collection');
    }
  },

  remove: async (address: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/collection/${address}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to remove collection');
    }
  },

  update: async (collection: Collection): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/collection/${collection.address}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update collection');
    }
  },

  updateUltimates: async (address: string, ultimates: boolean): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/collection/${address}/ultimates`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultimates }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update collection ultimates status');
    }
  },

  get: async (address: string): Promise<Collection | null> => {
    const response = await fetch(`${API_BASE_URL}/api/collection/${address}`);
    const data = await response.json();
    if (!data.success) {
      return null;
    }
    return data.collection;
  },
};

// Display Names API
export const displayNames = {
  get: async (address: string): Promise<string | null> => {
    const response = await fetch(`${API_BASE_URL}/api/display-names/${address}`);
    const data = await response.json();
    if (!data.success) {
      return null;
    }
    return data.displayName;
  },

  getAll: async (): Promise<DisplayNameMapping[]> => {
    const response = await fetch(`${API_BASE_URL}/api/display-names`);
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch display names');
    }
    return data.displayNames;
  },

  update: async (address: string, name: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/display-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletAddress: address,
        displayName: name 
      }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update display name');
    }
  },
};

// Market API
export const market = {
  listings: {
    fetch: async (): Promise<MarketListing[]> => {
      const response = await fetch(`${API_BASE_URL}/api/market/listings`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch listings');
      }
      return data.listings;
    },

    stats: async (): Promise<MarketStats> => {
      const response = await fetch(`${API_BASE_URL}/api/market/stats`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch market stats');
      }
      return data.stats;
    },
  },

  transactions: {
    list: async (data: ListNFTData): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/api/market/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(responseData.message || 'Failed to list NFT');
      }
    },

    purchase: async (data: PurchaseNFTData): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/api/market/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(responseData.message || 'Failed to purchase NFT');
      }
    },
  },
};

// Mint API
export const mint = {
  nft: async (data: MintNFTData): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/mint/nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const responseData = await response.json();
    if (!responseData.success) {
      throw new Error(responseData.message || 'Failed to mint NFT');
    }
  },
}; 