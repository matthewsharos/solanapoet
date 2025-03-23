import React from 'react';
import { styled } from '@mui/material/styles';
import { Container, Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { useWalletContext } from '../contexts/WalletContext';
import { useMarketData } from '../hooks/useMarketData';

// Import components
import SearchBar from '../components/Market/SearchBar';
import ActionButtons from '../components/Market/ActionButtons';
import LoadingIndicator from '../components/Market/LoadingIndicator';
import NFTGrid from '../components/Market/NFTGrid';
import PaginationControls from '../components/Market/PaginationControls';

// Styled components
const MarketContainer = styled(Container)(({ theme }) => ({
  position: 'relative',
  padding: theme.spacing(4),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

const MarketHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: theme.spacing(4),
  flexDirection: 'row',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: theme.spacing(2),
  },
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    justifyContent: 'space-between',
  },
}));

const Market: React.FC = () => {
  // Initialize hooks
  const { publicKey, connected } = useWalletContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Use our custom hook for market data and actions
  const {
    currentNFTs,
    isLoadingNFTs,
    loadingMessage,
    searchQuery,
    currentPage,
    totalPages,
    sorted,
    handleSearchChange,
    handlePageChange,
    handleSortByDate,
    loadAllNFTs
  } = useMarketData();

  return (
    <MarketContainer maxWidth="xl">
      <Typography 
        variant="h4" 
        component="h1" 
        gutterBottom 
        sx={{ 
          fontWeight: 'bold',
          textAlign: isMobile ? 'center' : 'left',
          marginBottom: theme.spacing(3)
        }}
      >
        Marketplace
      </Typography>
      
      <MarketHeader>
        <SearchBar 
          searchQuery={searchQuery} 
          onSearchChange={handleSearchChange} 
          isMobile={isMobile} 
        />
        
        <HeaderControls>
          <ActionButtons 
            onRefresh={loadAllNFTs}
            onSort={handleSortByDate}
            sorted={sorted}
            isMobile={isMobile}
          />
        </HeaderControls>
      </MarketHeader>
      
      {isLoadingNFTs ? (
        <LoadingIndicator message={loadingMessage} />
      ) : currentNFTs.length > 0 ? (
        <>
          <NFTGrid 
            nfts={currentNFTs} 
            isMobile={isMobile} 
            publicKey={publicKey} 
            connected={connected} 
          />
          
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              <PaginationControls 
                currentPage={currentPage} 
                totalPages={totalPages} 
                onPageChange={handlePageChange}
                isMobile={isMobile}
              />
            </Box>
          )}
        </>
      ) : (
        <Box sx={{ 
          textAlign: 'center', 
          py: 8,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          borderRadius: 2
        }}>
          <Typography variant="h6">
            {searchQuery ? 'No NFTs matching your search' : 'No NFTs available'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            {searchQuery 
              ? 'Try a different search term or refresh to load all NFTs' 
              : 'Please try refreshing or check back later'}
          </Typography>
        </Box>
      )}
    </MarketContainer>
  );
};

export default Market; 