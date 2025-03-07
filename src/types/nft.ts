export interface NFTAttribute {
  trait_type: string;
  value: string;
}

export interface NFTOwner {
  publicKey: string;
  delegate?: string | null;
  ownershipModel?: string;
  frozen?: boolean;
  delegated?: boolean;
  displayName?: string;
}

export interface NFT {
  mint: string;
  name: string;
  description: string;
  image: string;
  attributes: NFTAttribute[];
  owner: string | NFTOwner;
  listed: boolean;
  collectionName: string;
  collectionAddress: string;
  creators: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  royalty: number | null;
  tokenStandard: string | null;
  price?: number;
  createdAt?: string;
  collection?: {
    name?: string;
    address?: string;
    image?: string;
    description?: string;
  };
  imageWidth?: number;
  imageHeight?: number;
  lastSoldPrice?: number;
} 