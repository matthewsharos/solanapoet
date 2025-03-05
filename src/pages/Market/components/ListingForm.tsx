import React from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { NFT } from '../../../types/market';
import { listNFT } from '../../../api/market/transactions';
import { showErrorNotification } from '../../../utils/notifications';
import { isValidPublicKey } from '../../../utils/solana';

interface ListingFormProps {
  onListingCreated?: () => void;
}

export const ListingForm: React.FC<ListingFormProps> = ({ onListingCreated }) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [mintAddress, setMintAddress] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [nft, setNFT] = React.useState<NFT | null>(null);

  const handleMintAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMintAddress(value);
    setNFT(null);

    if (isValidPublicKey(value)) {
      // Fetch NFT metadata and update state
      // This would depend on your NFT metadata fetching implementation
    }
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPrice(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.connected) {
      showErrorNotification('Please connect your wallet');
      return;
    }

    if (!nft) {
      showErrorNotification('Please enter a valid NFT mint address');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      showErrorNotification('Please enter a valid price');
      return;
    }

    setLoading(true);
    try {
      const success = await listNFT(
        wallet,
        connection,
        nft,
        parseFloat(price)
      );

      if (success) {
        setMintAddress('');
        setPrice('');
        setNFT(null);
        onListingCreated?.();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="mintAddress"
          className="block text-sm font-medium text-gray-700"
        >
          NFT Mint Address
        </label>
        <input
          type="text"
          id="mintAddress"
          value={mintAddress}
          onChange={handleMintAddressChange}
          placeholder="Enter NFT mint address"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      {nft && (
        <div className="p-4 bg-gray-50 rounded-md">
          <h4 className="font-semibold">{nft.name}</h4>
          <p className="text-sm text-gray-600">{nft.symbol}</p>
        </div>
      )}

      <div>
        <label
          htmlFor="price"
          className="block text-sm font-medium text-gray-700"
        >
          Price (SOL)
        </label>
        <input
          type="text"
          id="price"
          value={price}
          onChange={handlePriceChange}
          placeholder="Enter price in SOL"
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
        {loading ? 'Creating Listing...' : 'Create Listing'}
      </button>
    </form>
  );
}; 