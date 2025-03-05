import { PublicKey } from '@solana/web3.js';

export interface NFT {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: NFTCreator[];
  collection?: {
    verified: boolean;
    key: PublicKey;
  };
  primarySaleHappened: boolean;
  isMutable: boolean;
  editionNonce: number;
  tokenStandard: number;
  uses?: {
    useMethod: number;
    remaining: number;
    total: number;
  };
}

export interface NFTCreator {
  address: PublicKey;
  verified: boolean;
  share: number;
}

export interface NFTListing {
  nft: NFT;
  price: number;
  seller: PublicKey;
  listingTimestamp: number;
  active: boolean;
}

export interface NFTOwner {
  owner: PublicKey;
  amount: number;
}

export interface PurchaseDetails {
  nft: NFT;
  price: number;
  seller: PublicKey;
  buyer: PublicKey;
  timestamp: number;
}

export interface MarketStats {
  totalListings: number;
  totalVolume: number;
  floorPrice: number;
  averagePrice: number;
} 