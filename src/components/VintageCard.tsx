import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, Typography, Box, styled, IconButton, Button, CircularProgress } from '@mui/material';
import { NFT, NFTOwner } from '../types/nft';
import { formatWalletAddress } from '../utils/helpers';
import NFTDetailModal from './NFTDetailModal';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useWalletContext } from '../contexts/WalletContext';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets, getAllDisplayNames, clearDisplayNameForWallet } from '../utils/displayNames';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Styled components for vintage card
const StyledCard = styled(Card)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  borderRadius: '8px',
  backgroundColor: '#f9f4e8',
  boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
  transition: 'all 0.3s ease',
  cursor: 'pointer',
  overflow: 'hidden',
  border: '1px solid #d4c4a8',
  display: 'flex',
  flexDirection: 'column',
  '&:hover': {
    transform: 'translateY(-5px)',
    boxShadow: '0 12px 20px rgba(0,0,0,0.2)',
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 30%)',
    pointerEvents: 'none',
  },
  // Desktop optimization to fill more space
  [theme.breakpoints.up('sm')]: {
    width: 'calc(100% - 0px)',  // Full width
    maxWidth: 'calc(100% - 0px)', // Full width
    margin: '0', // No margin
    marginLeft: '20px',
  },
  // Mobile optimization
  [theme.breakpoints.down('sm')]: {
    margin: '0 auto', // Center using auto margins
    borderRadius: '3px',
    width: '100%', // Full width
    maxWidth: '100%', // Full width
    border: '1px solid #d4c4a8',
    left: '54%', // Further right of center (increased from 52%)
    transform: 'translateX(-50%)',
    position: 'relative', // Needed for left/transform to work
    marginRight: '1px', // Increased right margin (from 8px to 12px)
    // Reduce hover animation on mobile to prevent bouncing
    '&:hover': {
      transform: 'translateX(-50%) translateY(-2px)', // Much smaller lift and preserve horizontal position
      boxShadow: '0 8px 16px rgba(0,0,0,0.15)', // Less dramatic shadow
    },
    // More stable transition on mobile
    transition: 'all 0.2s ease',
  }
}));

const CardTitleContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2, 2, 1, 2),
  borderBottom: '1px solid rgba(139, 69, 19, 0.2)',
  // Reduce padding equally on both sides for mobile
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.75, 0.25, 0.5, 0.25),
  }
}));

const CardTitle = styled(Typography)(({ theme }) => ({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '1.6rem',
  fontWeight: 600,
  color: '#262626',
  textAlign: 'center',
  textShadow: '2px 2px 3px rgba(0,0,0,0.15)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

const CardImageContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: theme.spacing(1),
  overflow: 'hidden',
  minHeight: '200px',
  position: 'relative',
  // Make image container wider on mobile by reducing padding
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.25), // Minimal padding
    minHeight: '170px', // Slightly shorter on mobile
  },
  // Make images fit better on desktop
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(0.5), // Minimal padding
  }
}));

const CardImage = styled('img')(({ theme }) => ({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  display: 'block',
  transition: 'transform 0.5s ease, opacity 0.3s ease-in-out',
  '&:hover': {
    transform: 'scale(1.05)',
  },
  // Reduce animation on mobile
  [theme.breakpoints.down('sm')]: {
    transition: 'transform 0.3s ease, opacity 0.2s ease-in-out',
    '&:hover': {
      transform: 'scale(1.02)', // Reduced zoom effect
    },
  }
}));

const LoadingImage = styled('div')({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(240, 234, 214, 0.3)',
});

const CardContentStyled = styled(CardContent)(({ theme }) => ({
  padding: theme.spacing(1.5),
  borderTop: '1px solid rgba(139, 69, 19, 0.2)',
  '&:last-child': {
    paddingBottom: theme.spacing(1.5),
  },
  // Reduce padding equally on both sides for mobile
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.75, 0.5),
    '&:last-child': {
      paddingBottom: theme.spacing(0.75),
    }
  }
}));

const OwnerTypography = styled(Typography)(({ theme }) => ({
  fontSize: '0.9rem',
  color: '#666',
  textAlign: 'center',
  marginTop: theme.spacing(1),
}));

const TypewriterKeyButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  bottom: '10px',
  right: '10px',
  width: '24px',
  height: '24px',
  backgroundColor: '#666666',
  border: '2px solid #555555',
  borderRadius: '4px',
  boxShadow: `
    0 3px 0 #444444,
    inset 0 1px 3px rgba(255,255,255,0.15)
  `,
  color: '#ffffff',
  transition: 'all 0.1s ease',
  zIndex: 10,
  background: `
    linear-gradient(135deg, #777777 0%, #666666 50%, #595959 100%)
  `,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.1) 2px,
        rgba(0,0,0,0.1) 4px
      )
    `,
    opacity: 0.3,
    borderRadius: '2px',
  },
  '&:hover': {
    backgroundColor: '#777777',
    transform: 'translateY(1px)',
    boxShadow: `
      0 2px 0 #444444,
      inset 0 1px 3px rgba(255,255,255,0.2)
    `,
  },
  '&:active': {
    transform: 'translateY(3px)',
    boxShadow: `
      0 0 0 #444444,
      inset 0 1px 3px rgba(0,0,0,0.2)
    `,
  },
  '& svg': {
    fontSize: '16px',
  },
  // Reduced animation on mobile
  [theme.breakpoints.down('sm')]: {
    transition: 'all 0.05s ease',
    '&:hover': {
      transform: 'translateY(0)', // No movement on hover
    },
    '&:active': {
      transform: 'translateY(1px)', // Less movement on press
    }
  }
}));

// Update the NFTWithObjectOwner type to match the one in marketplace.ts
type NFTWithObjectOwner = Omit<NFT, 'owner'> & {
  owner: string | NFTOwner;
};

// Add utility function to shorten addresses
const shortenAddress = (address: string) => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Update the interface to accept either type
interface VintageCardProps {
  nft: NFT;
  wallet: { publicKey: string | null } | null;
  connected: boolean;
  displayName?: string;
}

const VintageCard: React.FC<VintageCardProps> = ({ nft, wallet, connected, displayName }) => {
  const { publicKey } = useWalletContext();
  const [detailOpen, setDetailOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [ownerDisplayName, setOwnerDisplayName] = useState<string>('');
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // Safely determine the owner address based on the owner type
  const ownerAddress = React.useMemo(() => {
    if (!nft.owner) return '';
    return typeof nft.owner === 'string' 
      ? nft.owner 
      : (nft.owner.publicKey || '');
  }, [nft.owner]);

  // Effect to handle display name updates
  React.useEffect(() => {
    const updateOwnerDisplay = async () => {
      if (!ownerAddress) return;

      try {
        setIsUpdatingDisplayName(true);

        // First try to use the passed displayName prop
        if (displayName) {
          setOwnerDisplayName(displayName);
          return;
        }

        // Then try to use the owner's displayName if it exists
        if (typeof nft.owner !== 'string' && nft.owner?.displayName) {
          setOwnerDisplayName(nft.owner.displayName);
          return;
        }

        console.log(`VintageCard: Getting fresh display name for ${ownerAddress}`);
        
        // Force a fresh fetch from the server
        const freshDisplayName = await getDisplayNameForWallet(ownerAddress);
        
        if (freshDisplayName) {
          console.log(`VintageCard: Found fresh display name for ${ownerAddress}: ${freshDisplayName}`);
          setOwnerDisplayName(freshDisplayName);
        } else {
          // Show abbreviated wallet address in vintage card for better UI
          console.log(`VintageCard: No display name found, using abbreviated address for ${ownerAddress}`);
          setOwnerDisplayName(formatWalletAddress(ownerAddress));
        }
      } finally {
        setIsUpdatingDisplayName(false);
      }
    };

    // Update immediately
    void updateOwnerDisplay();

    interface DisplayNamesUpdateEvent extends CustomEvent {
      detail: {
        displayNames: {
          [key: string]: string | boolean | number | undefined;
          __forceRefresh?: boolean;
          __updatedAddress?: string;
          __timestamp?: number;
        }
      };
    }

    const handleDisplayNameUpdate = (event: DisplayNamesUpdateEvent) => {
      if (!event.detail?.displayNames || !ownerAddress) return;
      
      const displayNames = event.detail.displayNames;
      const updatedName = displayNames[ownerAddress];
      const isDirectUpdate = displayNames.__updatedAddress === ownerAddress;
      const timestamp = displayNames.__timestamp as number || Date.now();
      
      // Clear any pending updates
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = undefined;
      }
      
      // Handle force refresh
      if (displayNames.__forceRefresh) {
        console.log(`Force refresh detected for ${ownerAddress}`);
        
        // For direct updates, update immediately with the new value
        if (isDirectUpdate && typeof updatedName === 'string') {
          console.log(`Direct update with force refresh for ${ownerAddress}: ${updatedName}`);
          setOwnerDisplayName(updatedName);
        } else {
          // For non-direct updates, fetch fresh data after a short delay
          updateTimeoutRef.current = setTimeout(() => {
            updateOwnerDisplay();
          }, 100);
        }
        return;
      }
      
      // Handle regular updates
      if (typeof updatedName === 'string') {
        console.log(`Regular update for ${ownerAddress}: ${updatedName}`);
        setOwnerDisplayName(updatedName);
      }
    };

    // Listen for display name updates
    window.addEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);

    return () => {
      window.removeEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = undefined;
      }
    };
  }, [ownerAddress, displayName, nft.owner]);

  // Check if the current user is the owner
  const isOwner = React.useMemo(() => {
    if (!connected || !publicKey || !ownerAddress) return false;
    return publicKey === ownerAddress;
  }, [connected, publicKey, ownerAddress]);

  useEffect(() => {
    const loadImage = async () => {
      if (!nft.image) {
        setImageError(true);
        return;
      }

      try {
        setImageLoaded(false);
        setImageError(false);

        // Try to load the image
        const img = new Image();
        img.onload = () => {
          setImageUrl(nft.image);
          setImageLoaded(true);
        };
        img.onerror = () => {
          setImageError(true);
          setImageLoaded(false);
        };
        img.src = nft.image;
      } catch (error) {
        console.error('Error loading image:', error);
        setImageError(true);
        setImageLoaded(false);
      }
    };

    loadImage();
  }, [nft.image]);

  const handleCardClick = () => {
    setDetailOpen(true);
  };
  
  const handleDetailClose = () => {
    setDetailOpen(false);
  };

  const handleDownload = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!connected || !publicKey) {
      console.error('Wallet not connected');
      return;
    }

    setIsProcessing(true);
    try {
      if (!imageUrl) return;
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nft.name.replace(/\s+/g, '_')}_original.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading NFT:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <StyledCard onClick={handleCardClick}>
      <CardTitleContainer>
        <CardTitle>{nft.name}</CardTitle>
      </CardTitleContainer>
      
      <CardImageContainer>
        {!imageLoaded && !imageError && (
          <LoadingImage>
            <CircularProgress />
          </LoadingImage>
        )}
        {imageLoaded && !imageError && (
          <CardImage
            src={imageUrl}
            alt={nft.name}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
        )}
        {imageError && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: '#666'
          }}>
            Image not available
          </Box>
        )}
      </CardImageContainer>
      
      <CardContentStyled>
        <OwnerTypography>
          Owner: {ownerDisplayName || formatWalletAddress(ownerAddress)}
        </OwnerTypography>
      </CardContentStyled>
      
      <TypewriterKeyButton 
        onClick={handleDownload} 
        disabled={!imageLoaded || imageError || isProcessing}
      >
        <KeyboardArrowDownIcon />
      </TypewriterKeyButton>

      <NFTDetailModal
        open={detailOpen}
        onClose={handleDetailClose}
        nft={nft}
        displayName={ownerDisplayName}
      />
    </StyledCard>
  );
};

export default VintageCard; 