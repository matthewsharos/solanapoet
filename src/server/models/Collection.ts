import mongoose, { Schema, Document } from 'mongoose';

export interface ICollection extends Document {
  collectionId: string;
  name: string;
  description: string;
  symbol: string;
  imageUrl: string;
  creator: string;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionSchema: Schema = new Schema(
  {
    collectionId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    symbol: { type: String, required: true },
    imageUrl: { type: String, required: true },
    creator: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICollection>('Collection', CollectionSchema); 