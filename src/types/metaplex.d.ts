declare module '@metaplex-foundation/js' {
  import { PublicKey } from '@solana/web3.js';

  export interface CreateAuctionHouseInput {
    sellerFeeBasisPoints: number;
    requiresSignOff: boolean;
    canChangeSalePrice: boolean;
    treasuryMint: PublicKey;
    payer: PublicKey;
    authority: PublicKey;
    feeWithdrawalDestination: PublicKey;
    treasuryWithdrawalDestination: PublicKey;
    auctioneerAuthority?: PublicKey;
  }

  export interface NFTListing {
    mint: PublicKey;
    price: number;
    seller: PublicKey;
  }
}

declare module '@metaplex-foundation/umi' {
  export type Umi = any;
  export function createUmi(endpoint: string): Umi;
  export function publicKey(value: string): any;
}

declare module '@metaplex-foundation/mpl-token-metadata' {
  export interface TokenMetadata {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators?: Array<{
      address: string;
      verified: boolean;
      share: number;
    }>;
  }
  
  export function fetchDigitalAsset(umi: any, address: any): Promise<any>;
  export const mplTokenMetadata: any;
} 