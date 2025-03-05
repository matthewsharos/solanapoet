import React from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Collection } from '../../../types/mint';
import {
  createCollection,
  updateCollection
} from '../../../api/mint/transactions';
import {
  fetchCollections,
  fetchCollection,
  getCollectionStats
} from '../../../api/mint/collections';
import { showErrorNotification } from '../../../utils/notifications';

interface CollectionManagerProps {
  onCollectionSelect?: (collection: PublicKey) => void;
}

export const CollectionManager: React.FC<CollectionManagerProps> = ({
  onCollectionSelect
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [collections, setCollections] = React.useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = React.useState<Collection | null>(null);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [formData, setFormData] = React.useState<Omit<Collection, 'address'>>({
    name: '',
    symbol: '',
    description: '',
    image: '',
    creators: [],
    sellerFeeBasisPoints: 500 // 5%
  });

  const loadCollections = React.useCallback(async () => {
    if (!wallet.publicKey) return;

    try {
      const fetchedCollections = await fetchCollections(connection, {
        creator: wallet.publicKey
      });
      setCollections(fetchedCollections);
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  }, [connection, wallet.publicKey]);

  React.useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Here you would typically upload the file to your storage solution
      // and get back a URL. For now, we'll use a placeholder
      setFormData((prev) => ({ ...prev, image: URL.createObjectURL(file) }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.connected) {
      showErrorNotification('Please connect your wallet');
      return;
    }

    if (!formData.name || !formData.symbol || !formData.image) {
      showErrorNotification('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const collectionAddress = await createCollection(
        wallet,
        connection,
        {
          ...formData,
          creators: [
            {
              address: wallet.publicKey!,
              verified: true,
              share: 100
            }
          ]
        }
      );

      if (collectionAddress) {
        setFormData({
          name: '',
          symbol: '',
          description: '',
          image: '',
          creators: [],
          sellerFeeBasisPoints: 500
        });
        setShowCreateForm(false);
        loadCollections();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCollectionSelect = async (collection: Collection) => {
    setSelectedCollection(collection);
    onCollectionSelect?.(collection.address);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Your Collections</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
        >
          {showCreateForm ? 'Cancel' : 'Create Collection'}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="symbol"
              className="block text-sm font-medium text-gray-700"
            >
              Symbol *
            </label>
            <input
              type="text"
              id="symbol"
              name="symbol"
              value={formData.symbol}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-gray-700"
            >
              Image *
            </label>
            <input
              type="file"
              id="image"
              name="image"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 block w-full"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !wallet.connected}
            className={`w-full py-2 px-4 rounded-md text-white font-semibold ${
              loading || !wallet.connected
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Creating...' : 'Create Collection'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {collections.map((collection) => (
          <div
            key={collection.address.toString()}
            className={`bg-white rounded-lg shadow-md p-4 cursor-pointer transition-colors ${
              selectedCollection?.address.equals(collection.address)
                ? 'ring-2 ring-blue-500'
                : 'hover:bg-gray-50'
            }`}
            onClick={() => handleCollectionSelect(collection)}
          >
            <div className="aspect-square mb-4">
              <img
                src={collection.image}
                alt={collection.name}
                className="w-full h-full object-cover rounded-md"
              />
            </div>
            <h3 className="font-semibold">{collection.name}</h3>
            <p className="text-sm text-gray-600">{collection.symbol}</p>
          </div>
        ))}
      </div>

      {collections.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <h3 className="text-xl text-gray-600">No collections found</h3>
          <p className="text-gray-500 mt-2">
            Create your first collection to start minting NFTs!
          </p>
        </div>
      )}
    </div>
  );
}; 