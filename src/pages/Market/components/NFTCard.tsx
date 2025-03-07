import React, { useState } from 'react';
import { Box, Button, Card, CardContent, CardMedia, Typography } from '@mui/material';
import { showErrorNotification } from '../../../utils/notifications';
import { market } from '../../../api/client';
import { NFT } from '../../../types/nft';

interface NFTCardProps {
  nft: NFT;
  onPurchaseComplete: () => void;
}

const NFTCard: React.FC<NFTCardProps> = ({ nft, onPurchaseComplete }) => {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      await market.transactions.purchase({
        nftAddress: nft.mint,
        price: nft.price || 0,
        seller: typeof nft.owner === 'string' ? nft.owner : nft.owner.publicKey,
      });
      onPurchaseComplete();
    } catch (error) {
      showErrorNotification('Failed to purchase NFT');
      console.error('Error purchasing NFT:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 345, m: 1 }}>
      <CardMedia
        component="img"
        height="200"
        image={nft.image}
        alt={nft.name}
      />
      <CardContent>
        <Typography gutterBottom variant="h5" component="div">
          {nft.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {nft.description}
        </Typography>
        {nft.price && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" color="primary">
              {nft.price} SOL
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={handlePurchase}
              disabled={loading}
              fullWidth
              sx={{ mt: 1 }}
            >
              {loading ? 'Purchasing...' : 'Purchase'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default NFTCard; 