import mongoose from 'mongoose';
const { Schema } = mongoose;

const CollectionSchema = new Schema(
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

const Collection = mongoose.model('Collection', CollectionSchema);

export default Collection; 