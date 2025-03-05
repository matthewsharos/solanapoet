import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, Typography, Box, styled, IconButton, Button, CircularProgress } from '@mui/material';
import { NFT, NFTOwner } from '../types/nft';
import { formatWalletAddress } from '../utils/helpers';
import NFTDetailModal from './NFTDetailModal';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useWalletContext } from '../contexts/WalletContext';
import { ESCROW_WALLET_ADDRESS } from '../pages/Market';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets, normalizeAddress } from '../utils/displayNames';

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
  }
}));

const CardTitleContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2, 2, 1, 2),
  borderBottom: '1px solid rgba(139, 69, 19, 0.2)',
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
}));

const CardImage = styled('img')({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  display: 'block',
  transition: 'transform 0.5s ease, opacity 0.3s ease-in-out',
  '&:hover': {
    transform: 'scale(1.05)',
  },
});

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
    boxShadow: 'none',
    background: `
      linear-gradient(135deg, #595959 0%, #666666 50%, #777777 100%)
    `,
  },
  '& svg': {
    fontSize: '14px',
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))',
  }
}));

// Update the NFTWithObjectOwner type to match the one in marketplace.ts
type NFTWithObjectOwner = Omit<NFT, 'owner'> & {
  owner: string | NFTOwner;
};

// Update the interface to accept either type
interface VintageCardProps {
  nft: NFT | NFTWithObjectOwner;
  wallet: any;
  connected: boolean;
}

const VintageCard: React.FC<VintageCardProps> = ({ nft, wallet, connected }) => {
  const { wallet: contextWallet, connected: contextConnected } = useWalletContext();
  const [detailOpen, setDetailOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Safely determine the owner address based on the owner type
  const ownerAddress = React.useMemo(() => {
    if (!nft.owner) return '';
    return typeof nft.owner === 'string' 
      ? nft.owner 
      : nft.owner.publicKey || '';
  }, [nft.owner]);

  // Check if the current user is the owner
  const isOwner = React.useMemo(() => {
    if (!contextConnected || !contextWallet?.publicKey || !ownerAddress) return false;
    return contextWallet.publicKey.toBase58() === ownerAddress;
  }, [contextConnected, contextWallet?.publicKey, ownerAddress]);

  const handleCardClick = () => {
    setDetailOpen(true);
  };
  
  const handleDetailClose = () => {
    setDetailOpen(false);
  };

  const handleDownload = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!nft?.image) return;
    
    try {
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
      console.error('Error downloading image:', error);
    }
  };

  // Create helper function to display owner name
  const getDisplayOwner = useCallback(async (owner: string | NFTOwner): Promise<string> => {
    try {
      // If the NFT is listed, always show "Marketplace" regardless of the actual owner
      if (nft.listed) {
        return "Marketplace";
      }
      
      // Handle undefined or null owner
      if (!owner) {
        return "Unknown";
      }
      
      // If it's a string (wallet address)
      if (typeof owner === 'string') {
        // Check if it's the escrow wallet
        if (owner === ESCROW_WALLET_ADDRESS) {
          return "Marketplace";
        }
        
        // Try to get display name from Google Sheets
        try {
          const displayName = await getDisplayNameForWallet(owner);
          if (displayName) {
            return displayName;
          }
        } catch (error) {
          console.error('Error fetching display name:', error);
        }
        return formatWalletAddress(owner);
      }
      
      // If it's an NFTOwner object
      if (owner.publicKey === ESCROW_WALLET_ADDRESS) {
        return "Marketplace";
      }
      
      // Try to get display name from Google Sheets
      try {
        const displayName = await getDisplayNameForWallet(owner.publicKey);
        if (displayName) {
          return displayName;
        }
      } catch (error) {
        console.error('Error fetching display name:', error);
      }
      return formatWalletAddress(owner.publicKey);
    } catch (error) {
      console.error('Error in getDisplayOwner:', error);
      return "Unknown";
    }
  }, [nft.listed]);

  // State for owner display name
  const [ownerDisplayName, setOwnerDisplayName] = useState<string>('');
  const [isLoadingDisplayName, setIsLoadingDisplayName] = useState(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<string>('');

  // Effect to refresh display name when it changes
  useEffect(() => {
    const handleDisplayNameUpdate = async (event?: CustomEvent) => {
      try {
        // Get owner string safely
        const ownerStr = typeof nft.owner === 'string' 
          ? nft.owner 
          : nft.owner?.publicKey || '';

        if (!ownerStr) {
          console.log('No owner found for NFT');
          setOwnerDisplayName('Unknown');
          return;
        }

        const normalizedOwner = normalizeAddress(ownerStr);

        // If we received an event with specific wallet details
        if (event?.detail) {
          const { walletAddress, displayName } = event.detail;
          // Only update if this event is for our NFT's owner
          if (normalizedOwner === walletAddress) {
            console.log('Direct display name update for:', ownerStr);
            setOwnerDisplayName(displayName || 'Unknown');
            lastUpdateRef.current = ownerStr;
            return;
          }
        }

        // Skip if we're already showing the correct name
        if (lastUpdateRef.current === ownerStr) {
          return;
        }

        console.log('Fetching display name for:', ownerStr);
        setIsLoadingDisplayName(true);
        
        try {
          const displayName = await getDisplayOwner(nft.owner);
          console.log('Display name fetched:', displayName);
          setOwnerDisplayName(displayName || 'Unknown');
          lastUpdateRef.current = ownerStr;
        } catch (error) {
          console.error('Error fetching display name:', error);
          setOwnerDisplayName('Unknown');
        }
      } catch (error) {
        console.error('Error in display name update:', error);
        setOwnerDisplayName('Unknown');
      } finally {
        setIsLoadingDisplayName(false);
      }
    };

    // Add event listener with type assertion for CustomEvent
    const handleEvent = ((e: Event) => handleDisplayNameUpdate(e as CustomEvent)) as EventListener;
    window.addEventListener('displayNamesUpdated', handleEvent);

    // Initial load
    handleDisplayNameUpdate();

    // Cleanup
    return () => {
      window.removeEventListener('displayNamesUpdated', handleEvent);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [nft.owner, getDisplayOwner]);

  return (
    <>
      <StyledCard onClick={handleCardClick}>
        <CardTitleContainer>
          <CardTitle>{nft.title || nft.name}</CardTitle>
        </CardTitleContainer>
        <CardImageContainer>
          <CardImage 
            src={nft.image} 
            alt={nft.name}
            onLoad={() => setImageLoaded(true)}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
          {!imageLoaded && <LoadingImage><CircularProgress size={40} /></LoadingImage>}
        </CardImageContainer>
        
        <CardContentStyled>
          <OwnerTypography>
            Owned by: {isLoadingDisplayName ? (
              <CircularProgress size={16} sx={{ ml: 1 }} />
            ) : ownerDisplayName}
          </OwnerTypography>
        </CardContentStyled>
        <TypewriterKeyButton
          onClick={handleDownload}
          aria-label="Download original image"
          title="Download original image"
        >
          <KeyboardArrowDownIcon />
        </TypewriterKeyButton>
      </StyledCard>
      
      {detailOpen && (
        <NFTDetailModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          nft={{
            ...nft,
            owner: {
              publicKey: typeof nft.owner === 'string' ? nft.owner : nft.owner.publicKey,
              displayName: ownerDisplayName
            }
          }}
        />
      )}
    </>
  );
};

export default VintageCard; 