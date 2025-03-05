import React from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MintConfig } from '../../../types/mint';
import { mintNFT } from '../../../api/mint/transactions';
import { showErrorNotification } from '../../../utils/notifications';
import { isValidPublicKey } from '../../../utils/solana';

interface MintFormProps {
  onMintComplete?: () => void;
  collection?: PublicKey;
}

export const MintForm: React.FC<MintFormProps> = ({
  onMintComplete,
  collection
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState<MintConfig>({
    name: '',
    symbol: '',
    description: '',
    image: '',
    collection: collection,
    sellerFeeBasisPoints: 500, // 5%
    isMutable: true
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numberValue = value === '' ? undefined : parseInt(value);
    setFormData((prev) => ({ ...prev, [name]: numberValue }));
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
      const result = await mintNFT(wallet, connection, formData);
      if (result) {
        setFormData({
          name: '',
          symbol: '',
          description: '',
          image: '',
          collection: collection,
          sellerFeeBasisPoints: 500,
          isMutable: true
        });
        onMintComplete?.();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <div>
        <label
          htmlFor="sellerFeeBasisPoints"
          className="block text-sm font-medium text-gray-700"
        >
          Royalty (%)
        </label>
        <input
          type="number"
          id="sellerFeeBasisPoints"
          name="sellerFeeBasisPoints"
          value={formData.sellerFeeBasisPoints ? formData.sellerFeeBasisPoints / 100 : ''}
          onChange={(e) => {
            const value = e.target.value;
            const basisPoints = value === '' ? undefined : parseFloat(value) * 100;
            setFormData((prev) => ({
              ...prev,
              sellerFeeBasisPoints: basisPoints
            }));
          }}
          min="0"
          max="100"
          step="0.01"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
        {loading ? 'Minting...' : 'Mint NFT'}
      </button>
    </form>
  );
}; 