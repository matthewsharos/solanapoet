import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  IconButton,
  Typography,
  Paper,
  styled,
  CircularProgress
} from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { fetchCollectionNFTs, NFTMetadata } from '../utils/nftUtils';

const CarouselContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: 'rgba(255, 250, 240, 0.9)',
  border: '1px solid #8b4513',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}));

const ImageContainer = styled(Box)({
  position: 'relative',
  width: '100%',
  paddingTop: '100%', // 1:1 Aspect ratio
  marginBottom: '1rem',
});

const StyledImage = styled('img')({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
});

const NavigationButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
}));

const COLLECTION_ADDRESS = 'FnJqoQyQhwjUMTHmZZFrYVdNYHkjFcTd7HgiWXpiQajs';

const ImageCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nfts, setNfts] = useState<NFTMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % nfts.length);
  }, [nfts.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + nfts.length) % nfts.length);
  }, [nfts.length]);

  // Load NFTs
  useEffect(() => {
    const loadNFTs = async () => {
      const fetchedNFTs = await fetchCollectionNFTs(COLLECTION_ADDRESS);
      setNfts(fetchedNFTs);
      setLoading(false);
    };

    loadNFTs();
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (!loading && nfts.length > 0 && !isPaused) {
      const interval = setInterval(() => {
        handleNext();
      }, 1900);

      return () => clearInterval(interval);
    }
  }, [loading, nfts.length, isPaused, handleNext]);

  if (loading) {
    return (
      <CarouselContainer>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </CarouselContainer>
    );
  }

  if (nfts.length === 0) {
    return (
      <CarouselContainer>
        <Typography variant="h6" sx={{ textAlign: 'center' }}>
          No example images available
        </Typography>
      </CarouselContainer>
    );
  }

  return (
    <CarouselContainer
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <Typography variant="h5" sx={{ mb: 2, textAlign: 'center' }}>
        Example Typewriter Art
      </Typography>
      
      <Box sx={{ position: 'relative', flex: 1 }}>
        <ImageContainer>
          <StyledImage
            src={nfts[currentIndex].image}
            alt={nfts[currentIndex].name}
          />
          <NavigationButton
            onClick={handlePrev}
            sx={{ left: 8 }}
          >
            <ArrowBackIosIcon />
          </NavigationButton>
          <NavigationButton
            onClick={handleNext}
            sx={{ right: 8 }}
          >
            <ArrowForwardIosIcon />
          </NavigationButton>
        </ImageContainer>
        
        <Typography variant="h6" sx={{ textAlign: 'center', mb: 1 }}>
          {nfts[currentIndex].name}
        </Typography>
        {nfts[currentIndex].description && (
          <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
            {nfts[currentIndex].description}
          </Typography>
        )}
      </Box>
    </CarouselContainer>
  );
};

export default ImageCarousel; 