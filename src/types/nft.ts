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
} 