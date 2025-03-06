declare module '@metaplex-foundation/js' {
  import { PublicKey } from '@solana/web3.js';

  export class Metaplex {
    constructor(connection: any, options?: any);
    static make(connection: any, options?: any): Metaplex;
  }

  export function keypairIdentity(keypair: any): any;
  export const WRAPPED_SOL_MINT: PublicKey;
  export function sol(amount: number): any;
  export function toDateTime(value: any): Date;

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
    tokenSize?: number;
    expiry?: number;
  }
}

declare module '@metaplex-foundation/umi' {
  import { PublicKey } from '@solana/web3.js';

  export interface Umi {
    rpc: any;
    identity: any;
    transactions: any;
    payer: any;
    use: (plugin: any) => Umi;
  }
  
  export function createUmi(endpoint: string): Umi;
  export function publicKey(value: string): PublicKey;
  export function createSignerFromKeypair(keypair: any): any;
  export function signerIdentity(signer: any): any;
  export function sol(amount: number): { basisPoints: bigint };
  export function lamports(amount: number): bigint;
}

declare module '@metaplex-foundation/mpl-auction-house' {
  import { PublicKey } from '@solana/web3.js';
  import { Umi } from '@metaplex-foundation/umi';

  export interface AuctionHouse {
    address: PublicKey;
    authority: PublicKey;
    treasuryMint: PublicKey;
    feeAccount: PublicKey;
    treasuryAccount: PublicKey;
    feeWithdrawalDestination: PublicKey;
    treasuryWithdrawalDestination: PublicKey;
    sellerFeeBasisPoints: number;
    requiresSignOff: boolean;
    canChangeSalePrice: boolean;
  }

  export interface AuctionHouseListing {
    tradeState: PublicKey;
    seller: PublicKey;
    metadata: PublicKey;
    purchaseReceipt: PublicKey | null;
    price: { basisPoints: bigint };
    tokenSize: bigint;
    createdAt: Date;
    canceledAt: Date | null;
  }

  export interface CreateListingParams {
    auctionHouse: AuctionHouse;
    mintAccount: PublicKey;
    price: { basisPoints: bigint };
  }

  export interface ExecuteSaleParams {
    auctionHouse: AuctionHouse;
    listing: AuctionHouseListing;
  }

  export function mplAuctionHouse(): (umi: Umi) => Umi;
  export function createAuctionHouse(umi: Umi, params: CreateListingParams): Promise<{ auctionHouse: AuctionHouse }>;
  export function findAuctionHouseByAddress(umi: Umi, address: PublicKey): Promise<AuctionHouse>;
  export function createListing(umi: Umi, params: CreateListingParams): Promise<void>;
  export function cancelListing(umi: Umi, params: { auctionHouse: AuctionHouse; listing: AuctionHouseListing }): Promise<void>;
  export function executeSale(umi: Umi, params: ExecuteSaleParams): Promise<void>;
}

declare module '@metaplex-foundation/mpl-token-metadata' {
  import { Umi } from '@metaplex-foundation/umi';
  import { PublicKey } from '@solana/web3.js';

  export interface Creator {
    address: PublicKey;
    verified: boolean;
    share: number;
  }

  export interface TokenMetadata {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators?: Creator[];
    collection?: {
      verified: boolean;
      key: PublicKey;
    };
    uses?: {
      useMethod: number;
      remaining: number;
      total: number;
    };
  }
  
  export function fetchDigitalAsset(umi: Umi, address: PublicKey): Promise<{
    metadata: TokenMetadata;
    mint: PublicKey;
  }>;
  
  export function mplTokenMetadata(): (umi: Umi) => Umi;
} 