import mongoose, { Schema, Document } from 'mongoose';

export interface IListing extends Document {
  nftAddress: string;
  sellerAddress: string;
  price: number;
  listed: boolean;
  soldTo?: string;
  soldAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ListingSchema: Schema = new Schema(
  {
    nftAddress: { type: String, required: true },
    sellerAddress: { type: String, required: true },
    price: { type: Number, required: true },
    listed: { type: Boolean, default: true },
    soldTo: { type: String },
    soldAt: { type: Date },
  },
  { timestamps: true }
);

// Create a compound index to ensure a user can only list an NFT once
ListingSchema.index({ nftAddress: 1, sellerAddress: 1 }, { unique: true });

export default mongoose.model<IListing>('Listing', ListingSchema); 