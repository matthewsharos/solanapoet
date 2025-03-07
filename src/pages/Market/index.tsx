import React, { useState, useEffect } from 'react';
import { Box, Container, Grid, Typography, CircularProgress } from '@mui/material';
import { market } from '../../api/client';
import { NFT } from '../../types/nft';
import { MarketListing } from '../../types/api';
import NFTCard from './components/NFTCard';
import ListingForm from './components/ListingForm';

const Market: React.FC = () => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = async () => {
    try {
      setLoading(true);
      const fetchedListings = await market.listings.fetch();
      setListings(fetchedListings);

      // Convert listings to NFTs
      const convertedNfts = fetchedListings.map(listing => ({
        mint: listing.nftAddress,
        name: listing.name || 'Unknown NFT',
        description: listing.description || '',
        image: listing.image || '',
        attributes: [],
        owner: listing.seller,
        listed: true,
        collectionName: listing.collectionName || '',
        collectionAddress: listing.collectionAddress || '',
        creators: [],
        royalty: null,
        tokenStandard: null,
        price: listing.price,
        createdAt: listing.createdAt,
      }));

      setNfts(convertedNfts);
    } catch (err) {
      setError('Failed to fetch listings');
      console.error('Error fetching listings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          NFT Marketplace
        </Typography>
        <ListingForm onListingComplete={fetchListings} />
        <Grid container spacing={3} sx={{ mt: 4 }}>
          {nfts.map((nft) => (
            <Grid item xs={12} sm={6} md={4} key={nft.mint}>
              <NFTCard nft={nft} onPurchaseComplete={fetchListings} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  );
};

export default Market; 