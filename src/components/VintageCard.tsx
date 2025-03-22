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
  transition: 'opacity 0.3s ease-in-out',
  opacity: 1,
  // Reduce animation on mobile
  [theme.breakpoints.down('sm')]: {
    transition: 'opacity 0.2s ease-in-out',
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
  backgroundColor: 'rgba(240, 234, 214, 0.5)',
});

const PlaceholderImage = styled('div')(({ theme }) => ({
  width: '100%',
  height: '200px',
  backgroundColor: '#f0ead6',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  overflow: 'hidden',
  opacity: 1,
  transition: 'opacity 0.3s ease',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: -100,
    width: 'calc(100% + 200px)',
    height: '100%',
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
    animation: 'shimmer 1.5s infinite',
  },
  '@keyframes shimmer': {
    '0%': {
      transform: 'translateX(-100%)',
    },
    '100%': {
      transform: 'translateX(100%)',
    },
  },
  [theme.breakpoints.down('sm')]: {
    height: '170px',
  }
}));

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
  const [imageFailed, setImageFailed] = useState(false);
  const [ownerDisplay, setOwnerDisplay] = useState<string | undefined>(displayName);
  const imageRef = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  
  // Global image cache to prevent reloading across components
  // Using a static variable to persist across component instances
  if (!window.nftImageCache) {
    window.nftImageCache = new Map<string, boolean>();
  }
  
  // Effect to update owner display
  useEffect(() => {
    const updateOwnerDisplay = async () => {
      if (!nft.owner) return;
      
      // Use displayName from props if available
      if (displayName) {
        setOwnerDisplay(displayName);
        return;
      }
      
      try {
        const ownerAddress = typeof nft.owner === 'string' 
          ? nft.owner 
          : nft.owner.publicKey;
          
        if (!ownerAddress) return;
        
        const freshDisplayName = await getDisplayNameForWallet(ownerAddress);
        
        if (freshDisplayName) {
          setOwnerDisplay(freshDisplayName);
        } else {
          setOwnerDisplay(formatWalletAddress(ownerAddress));
        }
      } catch (error) {
        console.error('Error updating display name:', error);
        const ownerAddress = typeof nft.owner === 'string' 
          ? nft.owner 
          : nft.owner.publicKey;
          
        if (ownerAddress) {
          setOwnerDisplay(formatWalletAddress(ownerAddress));
        }
      }
    };
    
    updateOwnerDisplay();
    
    // Register custom event listener for display name updates
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
      if (!nft.owner) return;
      
      const ownerAddress = typeof nft.owner === 'string' 
        ? nft.owner.toLowerCase() 
        : (nft.owner.publicKey ? nft.owner.publicKey.toLowerCase() : '');
      
      if (!ownerAddress) return;
      
      const displayNames = event.detail?.displayNames;
      if (!displayNames) return;
      
      // Check if this specific wallet address was updated
      const updatedName = displayNames[ownerAddress];
      
      if (typeof updatedName === 'string') {
        setOwnerDisplay(updatedName);
      } else if (displayNames.__forceRefresh) {
        // If force refresh, update display name again
        updateOwnerDisplay();
      }
    };
    
    window.addEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);
    
    return () => {
      window.removeEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);
    };
  }, [nft.owner, displayName]);
  
  // Preload image once when component mounts
  useEffect(() => {
    if (!nft.image) {
      setImageFailed(true);
      setImageLoaded(true);
      return;
    }
    
    // Check if this image URL is already cached
    if (window.nftImageCache.has(nft.image)) {
      const isLoaded = window.nftImageCache.get(nft.image);
      setImageLoaded(true);
      setImageFailed(!isLoaded);
      return;
    }
    
    // Set a loading reference to prevent duplicate loads
    imageRef.current = nft.image;
    
    const img = new Image();
    
    img.onload = () => {
      // Only update state if this component is still trying to load the same image
      if (imageRef.current === nft.image) {
        window.nftImageCache.set(nft.image, true);
        setImageLoaded(true);
        setImageFailed(false);
      }
    };
    
    img.onerror = () => {
      // Only update state if this component is still trying to load the same image
      if (imageRef.current === nft.image) {
        window.nftImageCache.set(nft.image, false);
        setImageLoaded(true);
        setImageFailed(true);
      }
    };
    
    // If the image is already in browser cache, it may load immediately
    if (img.complete) {
      window.nftImageCache.set(nft.image, true);
      setImageLoaded(true);
      setImageFailed(false);
    } else {
      // Start loading
      img.src = nft.image;
    }
    
    // Clean up function
    return () => {
      // Clear the loading reference if component unmounts during loading
      imageRef.current = null;
    };
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
      if (!nft.image) return;
      
      const response = await fetch(nft.image);
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
    <StyledCard ref={cardRef} onClick={handleCardClick} elevation={3}>
      <CardTitleContainer>
        <CardTitle variant="h5">
          {typeof nft.name === 'string' ? nft.name : 'Unnamed NFT'}
        </CardTitle>
      </CardTitleContainer>
      
      <CardImageContainer>
        {!imageLoaded && (
          <PlaceholderImage>
            <CircularProgress size={30} thickness={4} color="secondary" />
          </PlaceholderImage>
        )}
        
        {nft.image && (
          <CardImage 
            ref={(el) => { imgElementRef.current = el; }}
            src={nft.image} 
            alt={typeof nft.name === 'string' ? nft.name : 'NFT Image'}
            loading="eager"
            style={{ 
              display: imageLoaded && !imageFailed ? 'block' : 'none',
              opacity: imageLoaded && !imageFailed ? 1 : 0
            }}
          />
        )}
        
        {imageLoaded && imageFailed && (
          <PlaceholderImage style={{ backgroundColor: '#f2e9e9' }}>
            <Typography variant="caption" color="error">
              Unable to load image
            </Typography>
          </PlaceholderImage>
        )}
      </CardImageContainer>
      
      <CardContent sx={{ p: 1.5, pt: 0.5 }}>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            textAlign: 'center',
            fontFamily: '"Special Elite", cursive',
            fontSize: '0.75rem',
            opacity: 0.8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          Owned by: {ownerDisplay || shortenAddress(typeof nft.owner === 'string' ? nft.owner : nft.owner.publicKey)}
        </Typography>
      </CardContent>
      
      <NFTDetailModal
        open={detailOpen}
        onClose={handleDetailClose}
        nft={nft}
        displayName={ownerDisplay}
      />
    </StyledCard>
  );
};

// TypeScript declaration for the global image cache
declare global {
  interface Window {
    nftImageCache: Map<string, boolean>;
  }
}

export default VintageCard; 