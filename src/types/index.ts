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
  mint: string;
  name: string;
  collection_id?: string;
  image: string;
  description?: string;
  attributes?: {
    trait_type: string;
    value: string;
  }[];
  price?: number;
  listed?: boolean;
} 