export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface NFTOwner {
  publicKey: string;
  displayName?: string;
}

export interface NFT {
  mint: string;
  name: string;
  title?: string;
  description?: string;
  image: string;
  imageUrl?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  owner: string | NFTOwner;
  collection?: string;
  collectionName?: string;
  listed?: boolean;
  price?: number;
  lister?: string;
  createdAt?: string;
  listing?: {
    seller_address: string;
    price: number;
    list_date: string;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
} 