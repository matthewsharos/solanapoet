import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import MintForm from './components/MintForm';

const Mint: React.FC = () => {
  const handleMintComplete = () => {
    // Handle mint completion
    console.log('NFT minted successfully');
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          Mint NFT
        </Typography>
        <MintForm onMintComplete={handleMintComplete} />
      </Box>
    </Container>
  );
};

export default Mint; 