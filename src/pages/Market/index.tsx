import React from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { NFTCard } from './components/NFTCard';
import { ListingForm } from './components/ListingForm';
import { fetchListings, fetchMarketStats } from '../../api/market/listings';
import { NFTListing } from '../../types/market';
import { MarketStats } from '../../types/market';

export const MarketPage: React.FC = () => {
  const { connection } = useConnection();
  const [listings, setListings] = React.useState<NFTListing[]>([]);
  const [stats, setStats] = React.useState<MarketStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showListingForm, setShowListingForm] = React.useState(false);

  const loadMarketData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedListings, marketStats] = await Promise.all([
        fetchListings(connection),
        fetchMarketStats(connection)
      ]);
      setListings(fetchedListings);
      setStats(marketStats);
    } catch (error) {
      console.error('Error loading market data:', error);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  React.useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  const handleListingCreated = () => {
    setShowListingForm(false);
    loadMarketData();
  };

  const handlePurchase = () => {
    loadMarketData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">NFT Marketplace</h1>
        <button
          onClick={() => setShowListingForm(!showListingForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
        >
          {showListingForm ? 'Cancel' : 'Create Listing'}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm">Total Listings</h3>
            <p className="text-2xl font-bold">{stats.totalListings}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm">Total Volume</h3>
            <p className="text-2xl font-bold">{stats.totalVolume} SOL</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm">Floor Price</h3>
            <p className="text-2xl font-bold">{stats.floorPrice} SOL</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm">Average Price</h3>
            <p className="text-2xl font-bold">{stats.averagePrice} SOL</p>
          </div>
        </div>
      )}

      {showListingForm && (
        <div className="mb-8">
          <ListingForm onListingCreated={handleListingCreated} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {listings.map((listing) => (
          <NFTCard
            key={listing.nft.mint.toString()}
            listing={listing}
            onPurchase={handlePurchase}
          />
        ))}
      </div>

      {listings.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-xl text-gray-600">No listings available</h3>
          <p className="text-gray-500 mt-2">
            Be the first to create a listing in the marketplace!
          </p>
        </div>
      )}
    </div>
  );
}; 