import React from 'react';
import { Box, Typography, CircularProgress, styled } from '@mui/material';

const LoadingContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  marginTop: theme.spacing(4),
  marginBottom: theme.spacing(4),
}));

interface LoadingIndicatorProps {
  message: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ message }) => {
  return (
    <LoadingContainer>
      <CircularProgress color="secondary" size={40} thickness={4} />
      <Typography variant="body1" sx={{ mt: 2 }}>
        {message || 'Loading NFTs...'}
      </Typography>
    </LoadingContainer>
  );
};

export default LoadingIndicator; 