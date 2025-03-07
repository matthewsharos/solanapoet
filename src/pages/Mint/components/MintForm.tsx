import React, { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { showErrorNotification } from '../../../utils/notifications';
import { mint } from '../../../api/client';
import { MintNFTData } from '../../../types/api';

interface MintFormProps {
  onMintComplete: () => void;
}

const MintForm: React.FC<MintFormProps> = ({ onMintComplete }) => {
  const [formData, setFormData] = useState<MintNFTData>({
    name: '',
    description: '',
    image: '',
    attributes: [],
    collection: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.image || !formData.collection) {
      showErrorNotification('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await mint.nft(formData);
      onMintComplete();
      setFormData({
        name: '',
        description: '',
        image: '',
        attributes: [],
        collection: '',
      });
    } catch (error) {
      showErrorNotification('Failed to mint NFT');
      console.error('Error minting NFT:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Mint New NFT
      </Typography>
      <TextField
        fullWidth
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        margin="normal"
        multiline
        rows={3}
      />
      <TextField
        fullWidth
        label="Image URL"
        value={formData.image}
        onChange={(e) => setFormData({ ...formData, image: e.target.value })}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Collection"
        value={formData.collection}
        onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
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
        {loading ? 'Minting...' : 'Mint NFT'}
      </Button>
    </Box>
  );
};

export default MintForm; 