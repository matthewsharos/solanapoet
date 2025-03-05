import mongoose, { Schema, Document } from 'mongoose';

export interface Attribute {
  trait_type: string;
  value: string;
}

export interface INFT extends Document {
  name: string;
  description: string;
  symbol: string;
  image: string;
  imageUrl: string;
  metadataUrl: string;
  attributes: Attribute[];
  address: string;
  collectionId: mongoose.Types.ObjectId;
  creator: string;
  owner: string;
  price: number | null;
  forSale: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NFTSchema = new Schema<INFT>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true, // IPFS hash
    },
    imageUrl: {
      type: String,
      required: true, // Full IPFS URL
    },
    metadataUrl: {
      type: String,
      required: true, // IPFS URL to metadata
    },
    attributes: [
      {
        trait_type: {
          type: String,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
      },
    ],
    address: {
      type: String,
      required: true,
      unique: true,
    },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
    },
    creator: {
      type: String,
      required: true, // Wallet address of creator
    },
    owner: {
      type: String,
      required: true, // Wallet address of current owner
    },
    price: {
      type: Number,
      default: null,
    },
    forSale: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
NFTSchema.index({ address: 1 }, { unique: true });
NFTSchema.index({ collectionId: 1 });
NFTSchema.index({ creator: 1 });
NFTSchema.index({ owner: 1 });
NFTSchema.index({ forSale: 1 });

export default mongoose.model<INFT>('NFT', NFTSchema); 