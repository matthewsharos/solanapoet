import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  Typography, 
  Box, 
  Button, 
  IconButton, 
  Link,
  styled,
  Chip,
  useTheme,
  useMediaQuery,
  CircularProgress,
  Tooltip,
  Grid
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/KeyboardReturn';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { NFT } from '../types/nft';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';
import { collections } from '../api/client';
import { format } from 'date-fns';
import CheckIcon from '@mui/icons-material/Check';

// Gallery-inspired styled components
const DetailDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    backgroundColor: '#f5f0e6', // Warm tan gallery wall color
    borderRadius: '0',
    maxWidth: '95vw',
    maxHeight: '95vh',
    height: 'auto', // Changed from fixed 95vh to auto for better mobile scrolling
    width: '95vw',
    margin: '0',
    overflow: 'hidden',
    boxShadow: '0 10px 50px rgba(0,0,0,0.5)',
    background: `linear-gradient(135deg, #f8f4ea 0%, #e8ddc8 100%)`,
    position: 'relative',
    
    // Improved mid-size screen experience
    [theme.breakpoints.between('md', 'lg')]: {
      maxWidth: '92vw',
      width: '92vw',
    },
    
    // Tablet optimizations (keep left-right layout but adjust dimensions)
    [theme.breakpoints.between('sm', 'md')]: {
      maxWidth: '95vw',
      width: '95vw',
      height: 'auto',
      maxHeight: '95vh',
    },
    
    // Mobile optimizations
    [theme.breakpoints.down('sm')]: {
      maxWidth: '100vw',
      maxHeight: '100vh',
      width: '100vw',
      height: '100vh',
      margin: 0,
      borderRadius: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto', // Allow scrolling
      marginTop: '30px', // Add top margin on mobile to prevent X button from being cut off
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d8cbb3' fill-opacity='0.1'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-0.895 2-2s-0.895-2-2-2-2 0.895-2 2 0.895 2 2 2zM60 91c1.105 0 2-0.895 2-2s-0.895-2-2-2-2 0.895-2 2 0.895 2 2 2zM35 41c1.105 0 2-0.895 2-2s-0.895-2-2-2-2 0.895-2 2 0.895 2 2 2zM12 60c1.105 0 2-0.895 2-2s-0.895-2-2-2-2 0.895-2 2 0.895 2 2 2z' fill='%23ddd6c2' fill-opacity='0.1'/%3E%3C/g%3E%3C/svg%3E")`,
      pointerEvents: 'none',
      opacity: 0.5,
      zIndex: 0,
    }
  },
}));

const GalleryCloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: '20px',
  top: '20px',
  color: '#333',
  backgroundColor: 'rgba(255,255,255,0.3)',
  backdropFilter: 'blur(5px)',
  border: '1px solid rgba(0,0,0,0.1)',
  zIndex: 10,
  '&:hover': {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  [theme.breakpoints.down('sm')]: {
    top: '10px', // Move the close button down on mobile
    right: '10px',
  }
}));

const ArtworkFrame = styled(Box)(({ theme }) => ({
  position: 'relative',
  borderRadius: '2px',
  backgroundColor: '#FFFFFF',
  overflow: 'hidden',
  boxShadow: `
    0 1px 2px rgba(0,0,0,0.1),
    0 2px 4px rgba(0,0,0,0.1)
  `,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    backgroundColor: '#222',
    borderRadius: '2px',
    boxShadow: `
      0 0 0 1px #444,
      0 0 0 10px #000,
      0 10px 30px rgba(0,0,0,0.3)
    `,
    zIndex: -1,
  },
  // Optimize frame styling for mobile
  [theme.breakpoints.down('sm')]: {
    width: '98%', // Use almost full width
    marginLeft: 'auto',
    marginRight: 'auto',
    '&::before': {
      top: -5,
      left: -5,
      right: -5,
      bottom: -5,
    }
  }
}));

const NFTImage = styled('img')({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  display: 'block',
  transition: 'transform 0.2s ease-out',
  width: 'auto',
  height: 'auto',
  '&:hover': {
    transform: 'scale(1.03)',
  }
});

const ArtworkMatting = styled(Box)(({ theme }) => ({
  backgroundColor: '#fff',
  padding: '12px',
  borderRadius: '1px',
  boxShadow: 'inset 0 0 6px rgba(0,0,0,0.2)',
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  overflow: 'hidden',
  position: 'relative',
  // Maintain aspect ratio while filling available space
  '& img': {
    objectFit: 'contain',
    maxHeight: '100%',
    maxWidth: '100%',
  },
  // Less padding on smaller screens for more image space
  [theme.breakpoints.down('md')]: {
    padding: '8px',
  }
}));

const DetailContent = styled(Box)(({ theme }) => ({
  padding: theme.spacing(4),
  overflowY: 'auto',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  [theme.breakpoints.down('md')]: {
    '& > *:not(:last-child)': {
      marginBottom: theme.spacing(1.5), // Add consistent spacing between sections on mobile
    }
  }
}));

const ArtworkTitle = styled(Typography)(({ theme }) => ({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  marginBottom: theme.spacing(2),
  color: '#111',
  fontWeight: 600,
  textShadow: '2px 2px 3px rgba(0,0,0,0.1)',
  position: 'relative',
  paddingBottom: theme.spacing(1),
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: '10%',
    width: '80%',
    height: '2px',
    background: 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,0.3), rgba(0,0,0,0))'
  }
}));

const OwnerSection = styled(Box)(({ theme }) => ({
  backgroundColor: 'rgba(255,255,255,0.5)',
  borderRadius: theme.spacing(1),
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(0,0,0,0.05)',
}));

// Collection section with golden styling
const CollectionSection = styled(Box)(({ theme }) => ({
  backgroundColor: 'rgba(255,252,240,0.6)',
  borderRadius: theme.spacing(1),
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(212, 175, 55, 0.3)',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: 'inset 0 0 10px rgba(212, 175, 55, 0.2), 0 3px 8px rgba(0,0,0,0.1)',
  transition: 'all 0.3s ease',
  [theme.breakpoints.up('md')]: {
    minHeight: '75px', // Reduced height for desktop
    padding: theme.spacing(2), // Reduced padding
  },
  [theme.breakpoints.down('md')]: {
    minHeight: '80px',
    padding: theme.spacing(1.5),
  },
  '&:hover': {
    boxShadow: 'inset 0 0 15px rgba(212, 175, 55, 0.3), 0 5px 12px rgba(0,0,0,0.15)',
    backgroundColor: 'rgba(255,253,245,0.7)',
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0) 50%, rgba(212, 175, 55, 0.1) 100%)',
    zIndex: 0,
    pointerEvents: 'none',
  }
}));

const CollectionName = styled(Typography)(({ theme }) => ({
  fontFamily: '"Cinzel", serif',
  fontWeight: 600,
  color: '#D4AF37', // Flat gold color instead of gradient
  textShadow: '0px 0px 2px rgba(212, 175, 55, 0.3)',
  letterSpacing: '0.05rem',
  position: 'relative',
  zIndex: 1,
  fontSize: '1.2rem',
  display: 'inline-block',
  padding: '2px 0',
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '1px',
    background: 'rgba(212, 175, 55, 0.3)',
    transform: 'scaleX(0)',
    transformOrigin: 'right',
    transition: 'transform 0.3s ease-out',
  },
  '&:hover::after': {
    transform: 'scaleX(1)',
    transformOrigin: 'left',
  }
}));

const CollectionIconBadge = styled(Box)(({ theme }) => ({
  width: '28px',
  height: '28px',
  marginRight: theme.spacing(1.5),
  background: 'linear-gradient(45deg, #d4af37 0%, #f9f295 50%, #d4af37 100%)',
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  color: '#000',
  fontWeight: 'bold',
  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
  animation: '$pulse 3s infinite ease-in-out',
  '@keyframes pulse': {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.08)' },
    '100%': { transform: 'scale(1)' }
  }
}));

const MetadataSection = styled(Box)(({ theme }) => ({
  backgroundColor: 'rgba(255,255,255,0.5)',
  borderRadius: theme.spacing(1),
  padding: theme.spacing(3),
  margin: theme.spacing(0, 0, 2, 0),
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(0,0,0,0.05)',
  maxHeight: theme.breakpoints.up('md') ? 'calc(100% - 280px)' : 'none', // Reduced height for desktop
  overflowY: 'auto',
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
    '& .MuiTypography-root:not(:last-child)': {
      marginBottom: theme.spacing(2),
    }
  }
}));

const MetadataLabel = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  fontSize: '0.8rem',
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.05rem',
  marginBottom: theme.spacing(0.5),
}));

const MetadataValue = styled(Typography)(({ theme }) => ({
  fontFamily: 'Arial, sans-serif',
  marginBottom: theme.spacing(2),
  fontSize: '1rem',
  color: '#333',
}));

const TraitChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  backgroundColor: '#f0e6d2',
  border: '1px solid #d4c4a8',
  '&:hover': {
    backgroundColor: '#e6dcc8',
  }
}));

// Add these new styled components
const ArtworkSpotlight = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '150%',
  height: '150%',
  background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
  pointerEvents: 'none',
  zIndex: 0,
}));

const FrameShadow = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: -25,
  left: '10%',
  right: '10%',
  height: '30px',
  background: 'rgba(0, 0, 0, 0.2)',
  filter: 'blur(15px)',
  borderRadius: '50%',
  zIndex: -2,
}));

const GalleryPlate = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: -30,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '2px 10px',
  backgroundColor: '#c0a47c',
  border: '1px solid #8b7355',
  borderRadius: '2px',
  fontSize: '10px',
  color: '#5c4c3a',
  fontFamily: 'monospace',
  letterSpacing: '1px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  zIndex: 5,
}));

// Gallery lighting effects
const AmbientGlow = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 2,
  overflow: 'hidden',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0) 60%)',
    opacity: 0.8,
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
    background: 'radial-gradient(circle at 70% 70%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 60%)',
    opacity: 0.5,
  }
}));

const DetailValueHighlight = styled('span')({
  color: '#8b4513',
  fontWeight: 500,
});

// Add floating dust particles effect
const GalleryDust = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  opacity: 0.4,
  '&::before, &::after': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundImage: `radial-gradient(circle at 50% 50%, white 0%, rgba(255, 255, 255, 0) 6%)`,
    backgroundSize: '8px 8px',
    backgroundRepeat: 'repeat',
    animation: 'float 15s linear infinite',
  },
  '&::after': {
    backgroundSize: '5px 5px',
    opacity: 0.5,
    animationDelay: '-5s',
    animationDuration: '20s',
  },
  '@keyframes float': {
    '0%': { transform: 'translateY(0)' },
    '100%': { transform: 'translateY(-100%)' }
  }
}));

// Add gallery background with subtle wooden floor
const GalleryBackground = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: -1,
  overflow: 'hidden',
  '&::before': { // Wooden floor effect
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    background: 'linear-gradient(180deg, #e8ddc8 0%, #d8c8a8 100%)',
    backgroundImage: `
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 40px,
        rgba(139, 69, 19, 0.1) 40px,
        rgba(139, 69, 19, 0.1) 80px
      )
    `,
  },
  '&::after': { // Wall texture
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '70%',
    background: 'linear-gradient(180deg, #f5f0e6 0%, #e8ddc8 100%)',
    backgroundImage: `
      linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.03) 1px,
        transparent 1px
      ),
      linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.02) 1px,
        transparent 1px
      )
    `,
    backgroundSize: '20px 20px',
  }
}));

// Add this after other styled components
const TypewriterKeyButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  bottom: '20px',
  right: '20px',
  width: '32px',
  height: '32px',
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
    fontSize: '16px',
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))',
  }
}));

const CopyButton = styled(IconButton)(({ theme }) => ({
  padding: 4,
  marginLeft: 4,
  '& svg': {
    fontSize: '0.9rem'
  }
}));

// Update the HeliusAssetResponse interface
interface HeliusAssetResponse {
  result: {
    interface: string;
    id: string;
    compression: {
      compressed: boolean;
      seq: number;
      tree: string;
      leaf_id: number;
      eligible: boolean;
      creator_hash: string;
      data_hash: string;
      asset_hash: string;
      created_at: string;
    };
    content: {
      metadata: {
        attributes?: Array<{
          trait_type: string;
          value: string;
        }>;
        description?: string;
      };
    };
  };
}

interface NFTDetailModalProps {
  open: boolean;
  onClose: () => void;
  nft: NFT & {
    imageWidth?: number;
    imageHeight?: number;
    lastSoldPrice?: number;
  };
  displayName?: string;
}

// Utility function to ensure we get full wallet addresses (not abbreviated)
const getFullWalletAddress = (address: string): string => {
  // This function intentionally just returns the full address
  // without any formatting or abbreviation
  return address;
};

// Update the DialogContent component to allow scrolling on mobile
const DialogContentStyled = styled(DialogContent)(({ theme }) => ({
  display: 'flex',
  // Horizontal layout for tablet and desktop (image left, details right)
  flexDirection: 'row',
  padding: theme.spacing(3),
  overflow: 'auto',
  height: '100%',
  gap: theme.spacing(3),
  // Use more dynamic sizing for mid-size screens
  [theme.breakpoints.between('md', 'lg')]: {
    gap: theme.spacing(2),
  },
  // Adjust for small tablets
  [theme.breakpoints.between('sm', 'md')]: {
    gap: theme.spacing(2),
    padding: theme.spacing(2),
  },
  // Vertical layout for mobile (image top, details bottom) with unified scrolling
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    padding: theme.spacing(2, 1.5), // Slightly increased horizontal padding
    overflowY: 'auto',
    overflowX: 'hidden',
    height: 'auto', 
    maxHeight: '100%',
    gap: theme.spacing(2),
    paddingTop: theme.spacing(5), // Increased top padding to avoid close button overlap
    paddingBottom: theme.spacing(8), // Extra padding at bottom for better scrolling
  }
}));

// Detail section titles
const DetailSectionTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  textTransform: 'uppercase',
  fontWeight: 600,
  marginBottom: '10px',
  fontSize: '18px',
  [theme.breakpoints.down('sm')]: {
    fontSize: '16px',
    marginTop: '15px',  // Added top margin for better spacing on mobile
    marginBottom: '8px',
  },
}));

// Detail section container
const DetailSection = styled(Box)(({ theme }) => ({
  marginBottom: '20px',
  [theme.breakpoints.down('sm')]: {
    marginBottom: '15px',
    paddingLeft: '5px',
    paddingRight: '5px',
  },
}));

const NFTDetailModal: React.FC<NFTDetailModalProps> = ({ open, onClose, nft, displayName }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [originalDimensions, setOriginalDimensions] = React.useState<{width: number, height: number} | null>(null);
  const [isLoadingDimensions, setIsLoadingDimensions] = React.useState(false);
  const [ownerDisplayName, setOwnerDisplayName] = React.useState<string>('');
  const [isLoadingDisplayName, setIsLoadingDisplayName] = React.useState<boolean>(false);
  const [creationDate, setCreationDate] = React.useState<string>('Loading...');
  const [isLoadingCreationDate, setIsLoadingCreationDate] = React.useState(false);
  const [collectionName, setCollectionName] = React.useState<string>('');
  const [isLoadingCollection, setIsLoadingCollection] = React.useState(false);
  const [copied, setCopied] = React.useState<boolean>(false);

  // Safely determine the owner address
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
      
      setIsLoadingDisplayName(true);
      try {
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

        // Force a fresh sync from Google Sheets and get display name
        await syncDisplayNamesFromSheets(true);
        const freshDisplayName = await getDisplayNameForWallet(ownerAddress);
        
        if (freshDisplayName) {
          console.log('Found fresh display name:', freshDisplayName, 'for address:', ownerAddress);
          setOwnerDisplayName(freshDisplayName);
        } else {
          // Show complete wallet address when no display name exists
          console.log('No display name found for address:', ownerAddress);
          // EXPLICITLY use the full wallet address with our helper
          setOwnerDisplayName(getFullWalletAddress(ownerAddress));
        }
      } catch (error) {
        console.error('Error setting owner display name:', error);
        // Display the full wallet address instead of abbreviated
        setOwnerDisplayName(getFullWalletAddress(ownerAddress));
      } finally {
        setIsLoadingDisplayName(false);
      }
    };

    if (open) {
      updateOwnerDisplay();
    }

    // Define a type for the display names update event
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

    // Listen for display name updates
    const handleDisplayNameUpdate = (event: Event) => {
      const customEvent = event as DisplayNamesUpdateEvent;
      console.log('Display name update event received in NFTDetailModal');
      
      // Check if it's a forced refresh (someone just updated their display name)
      if (customEvent.detail?.displayNames?.__forceRefresh) {
        console.log('Forced refresh detected, clearing owner display name cache');
        setOwnerDisplayName(''); // Clear current display to show loading state
        setIsLoadingDisplayName(true);
        
        // Use setTimeout to ensure UI refreshes before we start the async operation
        setTimeout(() => {
          updateOwnerDisplay();
        }, 100);
      } else {
        // Regular update
        updateOwnerDisplay();
      }
    };

    window.addEventListener('displayNamesUpdated', handleDisplayNameUpdate);
    return () => {
      window.removeEventListener('displayNamesUpdated', handleDisplayNameUpdate);
    };
  }, [open, ownerAddress, displayName, nft.owner]);

  // Update the fetchCreationDate function
  React.useEffect(() => {
    const fetchCreationDate = async () => {
      if (!nft.mint || !open) return;

      setIsLoadingCreationDate(true);
      try {
        // First get the asset to determine if it's compressed
        const assetResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getAsset',
            params: {
              id: nft.mint,
            },
          }),
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to fetch from Helius API');
        }

        const assetData = await assetResponse.json();
        console.log('Full Helius Asset API response:', JSON.stringify(assetData, null, 2));

        // Check if the NFT is compressed
        const isCompressed = assetData.result.compression?.compressed;
        console.log('Is NFT compressed:', isCompressed);

        if (isCompressed) {
          // For compressed NFTs, get the mint transaction
          const signaturesResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getSignaturesForAsset',
              params: {
                id: nft.mint,
                page: 1,
                limit: 1000,
              },
            }),
          });

          if (!signaturesResponse.ok) {
            throw new Error('Failed to fetch signatures');
          }

          const signaturesData = await signaturesResponse.json();
          console.log('Signatures response:', signaturesData);

          if (signaturesData.result?.items?.[0]?.[0]) {
            const signature = signaturesData.result.items[0][0];
            
            // Get the transaction details
            const txResponse = await fetch('https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'my-id',
                method: 'getTransaction',
                params: [signature],
              }),
            });

            if (txResponse.ok) {
              const txData = await txResponse.json();
              console.log('Transaction data:', JSON.stringify(txData, null, 2));
              
              if (txData.result?.blockTime) {
                const blockTime = txData.result.blockTime;
                console.log('Found blockTime:', blockTime);
                const date = new Date(blockTime * 1000);
                console.log('Converted date:', date.toISOString());
                setCreationDate(date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }));
                return;
              }
            }
          }
        } else {
          // For non-compressed NFTs, keep existing logic
          const signaturesResponse = await fetch('https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getSignaturesForAddress',
              params: [nft.mint, { limit: 1000 }],
            }),
          });

          if (!signaturesResponse.ok) {
            throw new Error('Failed to fetch signatures');
          }

          const signaturesData = await signaturesResponse.json();
          console.log('Signatures response:', signaturesData);

          if (signaturesData.result && signaturesData.result.length > 0) {
            const sortedSignatures = signaturesData.result.sort((a: any, b: any) => a.blockTime - b.blockTime);
            const earliestSignature = sortedSignatures[0];

            if (earliestSignature.blockTime) {
              const date = new Date(earliestSignature.blockTime * 1000);
              setCreationDate(date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }));
              return;
            }
          }
        }

        setCreationDate('Unknown');
      } catch (error) {
        console.error('Error fetching creation date:', error);
        setCreationDate('Unknown');
      } finally {
        setIsLoadingCreationDate(false);
      }
    };

    fetchCreationDate();
  }, [nft.mint, open]);

  // Format date
  const creationDateFormatted = nft.createdAt ? new Date(nft.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Unknown';

  // Calculate dimensions based on the viewport size
  const getFrameDimensions = () => {
    if (isMobile) {
      return {
        width: '100%',
        height: 'auto', // Changed from fixed height to auto
        maxHeight: '50vh', // Cap the max height to 50% of viewport height
        padding: 1, // Reduced padding for better fit
        marginTop: '15px', // Added top margin for spacing from the top
      };
    }
    return {
      width: '55%',
      height: '100%',
      padding: 4,
    };
  };

  // Load and determine the original image dimensions when the modal opens
  React.useEffect(() => {
    if (open && nft && nft.image) {
      setIsLoadingDimensions(true);
      
      const img = new Image();
      
      img.onload = () => {
        setOriginalDimensions({
          width: img.naturalWidth, 
          height: img.naturalHeight
        });
        setIsLoadingDimensions(false);
      };
      
      img.onerror = () => {
        // If there's an error loading the image, fall back to the properties from the NFT
        if (nft.imageWidth && nft.imageHeight) {
          setOriginalDimensions({
            width: nft.imageWidth, 
            height: nft.imageHeight
          });
        }
        setIsLoadingDimensions(false);
      };
      
      // Load the image from the URL
      img.src = nft.image;
    }
  }, [open, nft]);

  // Format dimensions for display
  const getDimensionsDisplay = () => {
    if (isLoadingDimensions) {
      return "Loading original dimensions...";
    }
    
    if (originalDimensions) {
      const { width, height } = originalDimensions;
      return `${width} × ${height} pixels`;
    }
    
    // Fallback to NFT properties if dimensions couldn't be determined
    if (nft.imageWidth && nft.imageHeight) {
      return `${nft.imageWidth} × ${nft.imageHeight} pixels`;
    }
    
    return "Dimensions unavailable";
  };

  // Add this function inside the NFTDetailModal component before the return statement
  const handleDownload = async () => {
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

  // Copy mint ID handler
  const handleCopyMintId = () => {
    if (nft?.mint) {
      navigator.clipboard.writeText(nft.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Add this function inside the NFTDetailModal component before the return statement
  const handleCopyOwnerAddress = async () => {
    try {
      // Always copy the full owner address, not the potentially abbreviated display name
      await navigator.clipboard.writeText(getFullWalletAddress(ownerAddress));
      console.log('Copied full owner address to clipboard:', ownerAddress);
    } catch (error) {
      console.error('Failed to copy owner address:', error);
    }
  };

  // Effect to handle collection name updates
  React.useEffect(() => {
    const updateCollectionName = async () => {
      if (!nft.collection?.address) {
        setCollectionName(nft.collectionName || "Unknown Collection");
        return;
      }

      setIsLoadingCollection(true);
      try {
        const collection = await collections.get(nft.collection.address);
        setCollectionName(collection?.name || nft.collectionName || "Unknown Collection");
      } catch (error) {
        console.error('Error fetching collection name:', error);
        setCollectionName(nft.collectionName || "Unknown Collection");
      } finally {
        setIsLoadingCollection(false);
      }
    };

    if (open) {
      updateCollectionName();
    }
  }, [open, nft.collection?.address, nft.collectionName]);

  return (
    <DetailDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      // Add fullScreen for mobile to improve scrolling
      fullScreen={isMobile}
    >
      <GalleryBackground />
      <AmbientGlow />
      <GalleryDust />
      <GalleryCloseButton 
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }} 
        aria-label="close"
      >
        <CloseIcon />
      </GalleryCloseButton>

      <DialogContentStyled>
        {/* Artwork display - left on desktop/tablet, top on mobile */}
        <Box sx={{ 
          ...getFrameDimensions(),
          display: 'flex', 
          flexDirection: 'column',
          position: 'relative',
          // Progressive width based on screen size
          width: isMobile 
            ? '100%' 
            : isTablet 
              ? '60%' // Increased from 50% to 60% on tablet
              : {
                  md: '65%', // More width on medium screens
                  lg: '60%', // Slightly less on large
                  xl: '55%'  // Back to original on xl
                },
          flex: isMobile ? 'none' : 1,
          // Height based on screen size - more compact on mobile for unified scrolling
          height: isMobile 
            ? 'auto'
            : 'calc(95vh - 80px)', // Slightly less than screen height for desktop/tablet
          maxHeight: isMobile 
            ? '40vh' // Reduced from 50vh to 40vh for better mobile scrolling
            : 'calc(95vh - 80px)', // Slightly less than screen height for desktop/tablet
          ...(isMobile && {
            marginBottom: '20px', // Increased space between image and details on mobile
          })
        }}>
          <ArtworkFrame sx={{ 
            flex: 1, 
            height: isMobile ? '100%' : 'calc(100% - 20px)',
            maxHeight: isMobile ? '40vh' : 'calc(95vh - 100px)',
            '&::before': {
              top: isMobile ? -5 : -10,
              left: isMobile ? -5 : -10,
              right: isMobile ? -5 : -10,
              bottom: isMobile ? -5 : -10,
            }
          }}>
            <ArtworkMatting>
              <NFTImage src={nft.image} alt={nft.name} />
            </ArtworkMatting>
            <FrameShadow />
            <ArtworkSpotlight />
          </ArtworkFrame>
        </Box>

        {/* Details - right on desktop/tablet, below image on mobile */}
        <DetailContent sx={{ 
          // Progressive width based on screen size, complementing the image width
          width: isMobile 
            ? '100%' 
            : isTablet 
              ? '40%' // Decreased from 50% to 40% on tablet
              : {
                  md: '35%', // Less width on medium screens
                  lg: '40%', // Slightly more on large
                  xl: '45%'  // Back to original on xl
                },
          height: isMobile ? 'auto' : '100%',
          flex: isMobile ? 1 : 'none',
          padding: isMobile 
            ? theme.spacing(2) 
            : isTablet 
              ? theme.spacing(2) // Less padding on tablet
              : theme.spacing(3), // Reduced padding on all sizes
          // Only use scroll on non-mobile - let the parent container handle mobile scrolling
          overflowY: isMobile ? 'visible' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          // Mobile-specific styles to create unified scrolling experience
          ...(isMobile && {
            minHeight: 'auto', // Let content determine height naturally
            maxHeight: 'none', // No height constraint
            flexGrow: 1,       // Take up available space
            paddingBottom: theme.spacing(4), // Extra padding at bottom
          }),
          // Non-mobile styling
          ...(!isMobile && {
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(0,0,0,0.05)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(139, 69, 19, 0.3)',
              borderRadius: '4px',
              '&:hover': {
                background: 'rgba(139, 69, 19, 0.5)',
              },
            },
          }),
          '& > *:not(:last-child)': {
            marginBottom: isMobile ? theme.spacing(2) : theme.spacing(2)
          },
        }}>
          {/* Title at the top right */}
          <ArtworkTitle variant="h4" sx={{ 
            textAlign: 'left',
            fontSize: isMobile ? '1.5rem' : '2rem',
            marginBottom: isMobile ? 1 : 2,
          }}>
            {nft.name}
          </ArtworkTitle>

          {/* NFT Details */}
          <DetailContent>
            {/* Description Section */}
            <DetailSection>
              <DetailSectionTitle>Description</DetailSectionTitle>
              <Typography variant="body1" sx={{ 
                mb: 2, 
                fontSize: { xs: '14px', sm: '15px', md: '16px' },
                lineHeight: { xs: 1.4, sm: 1.5, md: 1.6 },
                whiteSpace: 'pre-wrap',
              }}>
                {nft?.description || 'No description available'}
              </Typography>
            </DetailSection>

            {/* Traits Section */}
            {nft?.attributes && nft.attributes.length > 0 && (
              <DetailSection>
                <DetailSectionTitle>Traits</DetailSectionTitle>
                <Grid container spacing={2}>
                  {nft.attributes.map((attr, index) => (
                    <Grid item xs={6} sm={4} md={4} key={index}>
                      <Box
                        sx={{
                          border: '1px solid',
                          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                          borderRadius: '8px',
                          padding: { xs: '10px', sm: '12px' },
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: { xs: '11px', sm: '12px' } }}>
                          {attr.trait_type}
                        </Typography>
                        <Typography sx={{ mt: 0.5, fontWeight: '500', fontSize: { xs: '13px', sm: '14px' } }}>
                          {attr.value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </DetailSection>
            )}

            {/* Metadata Section */}
            <DetailSection>
              <DetailSectionTitle>Details</DetailSectionTitle>
              <Grid container spacing={2} sx={{ mb: 1 }}>
                {/* Created */}
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: { xs: '12px', sm: '13px' } }}>
                    Created
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '13px', sm: '14px' }, fontWeight: '500' }}>
                    {nft?.createdAt ? format(new Date(nft.createdAt), 'MMM d, yyyy') : 'Unknown'}
                  </Typography>
                </Grid>

                {/* Mint ID with copy button */}
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: { xs: '12px', sm: '13px' } }}>
                    Mint ID
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Typography sx={{ 
                      fontSize: { xs: '13px', sm: '14px' }, 
                      fontWeight: '500',
                      maxWidth: { xs: '190px', sm: '100%' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {nft?.mint || 'Unknown'}
                    </Typography>
                    {nft?.mint && (
                      <IconButton 
                        onClick={handleCopyMintId}
                        size="small" 
                        sx={{ p: '2px' }}
                      >
                        {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                      </IconButton>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </DetailSection>
          </DetailContent>
        </DetailContent>

        <TypewriterKeyButton
          onClick={handleDownload}
          aria-label="Download original image"
          title="Download original image"
          sx={{
            position: 'absolute',
            bottom: isMobile ? '10px' : '20px',
            right: isMobile ? '10px' : '20px',
            zIndex: 10,
          }}
        >
          <KeyboardArrowDownIcon />
        </TypewriterKeyButton>
      </DialogContentStyled>
    </DetailDialog>
  );
};

export default NFTDetailModal; 