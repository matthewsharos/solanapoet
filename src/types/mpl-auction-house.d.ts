import { PublicKey } from '@solana/web3.js';
import { Umi } from '@metaplex-foundation/umi';

declare module '@metaplex-foundation/mpl-auction-house' {
  export const mplAuctionHouse: () => any;

  export type CreateAuctionHouseParams = {
    sellerFeeBasisPoints: number;
    requiresSignOff: boolean;
    canChangeSalePrice: boolean;
    treasuryMint: PublicKey;
  };

  export type CreateAuctionHouseResult = {
    auctionHouse: AuctionHouse;
  };

  export type AuctionHouse = {
    address: PublicKey;
    feeAccountAddress: PublicKey;
    treasuryAccountAddress: PublicKey;
  };

  export type FindListingsParams = {
    auctionHouse: AuctionHouse;
    seller?: PublicKey;
    mint?: PublicKey;
  };

  export type Listing = {
    price: {
      basisPoints: {
        toNumber(): number;
      };
    };
  };

  export type CreateListingParams = {
    auctionHouse: AuctionHouse;
    mintAccount: PublicKey;
    price: any; // Using any for now as the exact type is complex
  };

  export type CreateListingResult = {
    listing: Listing;
    sellerTradeState: PublicKey;
  };

  export type CancelListingParams = {
    auctionHouse: AuctionHouse;
    listing: Listing;
  };

  export type ExecuteSaleParams = {
    auctionHouse: AuctionHouse;
    listing: Listing;
  };

  export const createAuctionHouse: (umi: Umi, params: CreateAuctionHouseParams) => Promise<CreateAuctionHouseResult>;
  export const findAuctionHouseByAddress: (umi: Umi, params: { address: PublicKey }) => Promise<AuctionHouse>;
  export const findListingsByTradeState: (umi: Umi, params: FindListingsParams) => Promise<Listing[]>;
  export const createListing: (umi: Umi, params: CreateListingParams) => Promise<CreateListingResult>;
  export const cancelListing: (umi: Umi, params: CancelListingParams) => Promise<void>;
  export const executeSale: (umi: Umi, params: ExecuteSaleParams) => Promise<void>;
} 