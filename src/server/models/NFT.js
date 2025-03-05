import mongoose from 'mongoose';
const { Schema } = mongoose;

const NFTSchema = new Schema(
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
      type: String,
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
      default: 0,
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
// NFTSchema.index({ address: 1 }, { unique: true });
NFTSchema.index({ collectionId: 1 });
NFTSchema.index({ creator: 1 });
NFTSchema.index({ owner: 1 });
NFTSchema.index({ forSale: 1 });

const NFT = mongoose.model('NFT', NFTSchema);

export default NFT; 