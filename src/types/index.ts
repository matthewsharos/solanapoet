export interface Collection {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  discord?: string;
}

export interface UltimateNFT {
  "NFT Address": string;
  "Name": string;
  "Owner": string;
  "collection_id": string;
  // Optional extended properties for UI
  image?: string;
  description?: string;
  attributes?: {
    trait_type: string;
    value: string;
  }[];
  price?: number;
  listed?: boolean;
} 