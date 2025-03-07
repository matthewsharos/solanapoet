import React, { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { showErrorNotification } from '../../../utils/notifications';
import { isValidPublicKey } from '../../../utils/solana';
import { market } from '../../../api/client';

interface ListingFormProps {
  onListingComplete: () => void;
}

const ListingForm: React.FC<ListingFormProps> = ({ onListingComplete }) => {
  const [nftAddress, setNftAddress] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidPublicKey(nftAddress)) {
      showErrorNotification('Please enter a valid NFT address');
      return;
    }

    const priceNumber = parseFloat(price);
    if (isNaN(priceNumber) || priceNumber <= 0) {
      showErrorNotification('Please enter a valid price');
      return;
    }

    setLoading(true);
    try {
      await market.transactions.list({
        nftAddress,
        price: priceNumber,
      });
      onListingComplete();
      setNftAddress('');
      setPrice('');
    } catch (error) {
      showErrorNotification('Failed to list NFT');
      console.error('Error listing NFT:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        List NFT for Sale
      </Typography>
      <TextField
        fullWidth
        label="NFT Address"
        value={nftAddress}
        onChange={(e) => setNftAddress(e.target.value)}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Price (SOL)"
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        margin="normal"
        required
      />
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={loading}
        sx={{ mt: 2 }}
      >
        {loading ? 'Listing...' : 'List NFT'}
      </Button>
    </Box>
  );
};

export default ListingForm; 