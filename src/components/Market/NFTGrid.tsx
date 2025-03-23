import React from 'react';
import { Grid, styled } from '@mui/material';
import { NFT } from '../../types/nft';
import VintageCard from '../VintageCard';

const StyledGrid = styled(Grid)(({ theme }) => ({
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    marginTop: theme.spacing(1),
  },
}));

interface NFTGridProps {
  nfts: NFT[];
  isMobile: boolean;
  publicKey: string | null;
  connected: boolean;
}

const NFTGrid: React.FC<NFTGridProps> = ({ nfts, isMobile, publicKey, connected }) => {
  return (
    <StyledGrid container spacing={isMobile ? 1 : 2}>
      {nfts.map((nft, index) => (
        <Grid item xs={6} sm={4} md={3} lg={2} key={`${nft.mint}-${index}`}>
          <VintageCard 
            nft={nft} 
            wallet={publicKey ? { publicKey } : null} 
            connected={connected}
          />
        </Grid>
      ))}
    </StyledGrid>
  );
};

export default NFTGrid; 