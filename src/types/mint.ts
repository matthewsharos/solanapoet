import { PublicKey } from '@solana/web3.js';
import { NFTCreator } from './market';

export interface Collection {
  address: PublicKey;
  name: string;
  symbol: string;
  description: string;
  image: string;
  externalUrl?: string;
  creators: NFTCreator[];
  sellerFeeBasisPoints: number;
}

export interface MintConfig {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animationUrl?: string;
  externalUrl?: string;
  attributes?: {
    trait_type: string;
    value: string | number;
  }[];
  collection?: PublicKey;
  creators?: NFTCreator[];
  sellerFeeBasisPoints?: number;
  isMutable?: boolean;
}

export interface MintResult {
  mint: PublicKey;
  metadata: PublicKey;
  masterEdition?: PublicKey;
  tokenAccount: PublicKey;
} 