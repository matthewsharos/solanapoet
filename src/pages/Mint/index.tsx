import React from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MintForm } from './components/MintForm';
import { CollectionManager } from './components/CollectionManager';

export const MintPage: React.FC = () => {
  const { connection } = useConnection();
  const [selectedCollection, setSelectedCollection] = React.useState<PublicKey | undefined>();

  const handleCollectionSelect = (collection: PublicKey) => {
    setSelectedCollection(collection);
  };

  const handleMintComplete = () => {
    // Optionally refresh any data after minting
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Create NFTs</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <CollectionManager onCollectionSelect={handleCollectionSelect} />
        </div>

        <div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-6">Mint NFT</h2>
            {selectedCollection ? (
              <MintForm
                collection={selectedCollection}
                onMintComplete={handleMintComplete}
              />
            ) : (
              <div className="text-center py-12">
                <h3 className="text-xl text-gray-600">No Collection Selected</h3>
                <p className="text-gray-500 mt-2">
                  Please select or create a collection to start minting NFTs
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 