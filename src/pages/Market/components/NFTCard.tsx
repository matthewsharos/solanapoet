import React from 'react';
import { NFTListing } from '../../../types/market';
import { useWallet } from '@solana/wallet-adapter-react';
import { purchaseNFT } from '../../../api/market/transactions';
import { showErrorNotification } from '../../../utils/notifications';
import { useConnection } from '@solana/wallet-adapter-react';
import { Tooltip } from '@mui/material';
import { formatWalletAddress } from '../../../utils/helpers';

interface NFTCardProps {
  listing: NFTListing;
  onPurchase?: () => void;
}

export const NFTCard: React.FC<NFTCardProps> = ({ listing, onPurchase }) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = React.useState(false);

  const handlePurchase = async () => {
    if (!wallet.connected) {
      showErrorNotification('Please connect your wallet');
      return;
    }

    setLoading(true);
    try {
      const result = await purchaseNFT(wallet, connection, listing);
      if (result) {
        onPurchase?.();
      }
    } finally {
      setLoading(false);
    }
  };

  // Get seller's address
  const sellerAddress = listing.seller.toString();

  return (
    <div className="relative bg-[#f4e4bc] rounded-lg overflow-hidden transform transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
         style={{
           boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
           border: '1px solid #d4b483',
         }}>
      <div className="relative aspect-square">
        {/* Vintage photo effect wrapper */}
        <div className="absolute inset-0 bg-black/10 z-10 pointer-events-none"
             style={{
               boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3)',
             }} />
        <img
          src={listing.nft.uri}
          alt={listing.nft.name}
          className="w-full h-full object-cover"
          style={{
            filter: 'sepia(20%) contrast(105%)',
          }}
        />
        {/* Vintage border overlay */}
        <div className="absolute inset-0 pointer-events-none"
             style={{
               border: '12px solid #f4e4bc',
               boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)',
             }} />
      </div>
      <div className="p-4 bg-gradient-to-b from-[#f4e4bc] to-[#e6d5b1]">
        <h3 className="text-lg font-serif mb-2 text-[#5c4b37]"
            style={{
              textShadow: '1px 1px 0 rgba(255,255,255,0.5)',
            }}>
          {listing.nft.name}
        </h3>
        <div className="flex justify-between items-center mb-2">
          <Tooltip title={sellerAddress} placement="top">
            <span className="text-sm text-[#8b7355] cursor-help font-mono"
                  style={{
                    textShadow: '0.5px 0.5px 0 rgba(255,255,255,0.5)',
                  }}>
              Owned by {formatWalletAddress(sellerAddress, 4)}
            </span>
          </Tooltip>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#8b7355] font-serif">{listing.nft.symbol}</span>
          <span className="text-[#8b7355] font-serif">{listing.price} SOL</span>
        </div>
      </div>
    </div>
  );
}; 