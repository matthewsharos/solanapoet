import React from 'react';
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
  Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/KeyboardReturn';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { NFT } from '../types/nft';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';
import { getCollection } from '../api/collections';

// Gallery-inspired styled components
const DetailDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    backgroundColor: '#f5f0e6', // Warm tan gallery wall color
    borderRadius: '0',
    maxWidth: '95vw',
    maxHeight: '95vh',
    height: '95vh',
    width: '95vw',
    margin: '0',
    overflow: 'hidden',
    boxShadow: '0 10px 50px rgba(0,0,0,0.5)',
    background: `linear-gradient(135deg, #f8f4ea 0%, #e8ddc8 100%)`,
    position: 'relative',
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
  }
}));

const ArtworkFrame = styled(Box)(({ theme }) => ({
  position: 'relative',
  maxHeight: 'calc(100% - 50px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0',
  [theme.breakpoints.down('md')]: {
    maxHeight: 'calc(100% - 20px)', // Reduce space on mobile
  },
  '&::before': { // Realistic frame effect
    content: '""',
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    backgroundColor: '#111',
    borderRadius: '2px',
    boxShadow: `
      0 0 0 1px #222,
      0 0 0 10px #000,
      0 5px 20px rgba(0,0,0,0.4),
      0 10px 30px rgba(0,0,0,0.2)
    `,
    zIndex: -1,
  }
}));

const ArtworkMatting = styled(Box)(({ theme }) => ({
  backgroundColor: '#fff',
  padding: '12px',
  boxSizing: 'border-box',
  borderRadius: '2px',
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const NFTImage = styled('img')({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
});

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

const NFTDetailModal: React.FC<NFTDetailModalProps> = ({ open, onClose, nft, displayName }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [originalDimensions, setOriginalDimensions] = React.useState<{width: number, height: number} | null>(null);
  const [isLoadingDimensions, setIsLoadingDimensions] = React.useState(false);
  const [ownerDisplayName, setOwnerDisplayName] = React.useState<string>('');
  const [isLoadingDisplayName, setIsLoadingDisplayName] = React.useState(false);
  const [creationDate, setCreationDate] = React.useState<string>('Loading...');
  const [isLoadingCreationDate, setIsLoadingCreationDate] = React.useState(false);
  const [collectionName, setCollectionName] = React.useState<string>('');
  const [isLoadingCollection, setIsLoadingCollection] = React.useState(false);

  // Safely determine the owner address
  const ownerAddress = React.useMemo(() => {
    if (!nft.owner) return '';
    return typeof nft.owner === 'string' 
      ? nft.owner 
      : nft.owner.publicKey || '';
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
          setOwnerDisplayName(ownerAddress);
        }
      } catch (error) {
        console.error('Error setting owner display name:', error);
        setOwnerDisplayName(ownerAddress);
      } finally {
        setIsLoadingDisplayName(false);
      }
    };

    if (open) {
      updateOwnerDisplay();
    }

    // Listen for display name updates
    const handleDisplayNameUpdate = () => {
      updateOwnerDisplay();
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
        height: '55vh',
        padding: 2,
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

  // Add this function inside the NFTDetailModal component before the return statement
  const handleCopyMintId = async () => {
    try {
      await navigator.clipboard.writeText(nft.mint);
    } catch (error) {
      console.error('Failed to copy mint ID:', error);
    }
  };

  // Add this function inside the NFTDetailModal component before the return statement
  const handleCopyOwnerAddress = async () => {
    try {
      await navigator.clipboard.writeText(ownerAddress);
    } catch (error) {
      console.error('Failed to copy owner address:', error);
    }
  };

  // Effect to handle collection name updates
  React.useEffect(() => {
    const updateCollectionName = async () => {
      if (!nft.collection) {
        setCollectionName(nft.collectionName || "Unknown Collection");
        return;
      }

      setIsLoadingCollection(true);
      try {
        const collection = await getCollection(nft.collection);
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
  }, [open, nft.collection, nft.collectionName]);

  return (
    <DetailDialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: { 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
          maxHeight: isMobile ? '90vh' : '95vh',
          height: isMobile ? '90vh' : '95vh',
        }
      }}
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

      {/* Left side: Artwork display only */}
      <Box sx={{ 
        ...getFrameDimensions(),
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        ...(isMobile && {
          marginBottom: '-10px', // Reduce bottom margin on mobile
        })
      }}>
        <ArtworkFrame sx={{ 
          flex: 1, 
          height: '100%',
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

      {/* Right side: Title, Owner info, and Metadata */}
      <DetailContent sx={{ 
        width: isMobile ? '100%' : '45%', 
        height: isMobile ? '35vh' : '100%',
        padding: isMobile ? theme.spacing(2) : theme.spacing(4),
        overflowY: 'auto',
        '& > *:not(:last-child)': {
          marginBottom: isMobile ? theme.spacing(1.5) : theme.spacing(2)
        },
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
      }}>
        {/* Title at the top right */}
        <ArtworkTitle variant="h4" sx={{ 
          textAlign: 'left',
          fontSize: isMobile ? '1.5rem' : '2rem',
          marginBottom: isMobile ? 1 : 2,
        }}>
          {nft.name}
        </ArtworkTitle>

        {/* Owner section */}
        <OwnerSection sx={{ marginBottom: isMobile ? 1 : 2 }}>
          <MetadataLabel>Owner</MetadataLabel>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'flex-start',
            gap: 1
          }}>
            <Typography 
              variant="h6" 
              component="div"
              sx={{ 
                fontFamily: '"Arial", sans-serif',
                fontWeight: 500,
                color: '#333',
                fontSize: '0.9rem',
                flex: 1,
                maxWidth: 'calc(100% - 40px)',
                whiteSpace: 'normal',
                overflowWrap: 'break-word'
              }}
            >
              {isLoadingDisplayName ? (
                <CircularProgress size={20} sx={{ mr: 1 }} />
              ) : ownerDisplayName}
            </Typography>
            <Tooltip title="Copy Owner Address">
              <CopyButton onClick={handleCopyOwnerAddress} size="small">
                <ContentCopyIcon />
              </CopyButton>
            </Tooltip>
          </Box>
        </OwnerSection>

        {/* Collection section */}
        <CollectionSection sx={{ marginBottom: isMobile ? 1 : 2 }}>
          <MetadataLabel sx={{ color: '#6B5900' }}>Collection</MetadataLabel>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CollectionIconBadge>★</CollectionIconBadge>
            <CollectionName variant="h6">
              {isLoadingCollection ? (
                <CircularProgress size={16} sx={{ mr: 1 }} />
              ) : collectionName}
            </CollectionName>
          </Box>
        </CollectionSection>

        {/* Metadata section */}
        <MetadataSection sx={{ 
          padding: isMobile ? 2 : 3,
          '& .MuiTypography-root': {
            marginBottom: isMobile ? 1 : 2,
          }
        }}>
          <MetadataLabel>Description</MetadataLabel>
          <MetadataValue>{nft.description}</MetadataValue>
          
          <MetadataLabel>Traits</MetadataLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', mb: 2 }}>
            {nft.attributes?.map((attr) => (
              <TraitChip 
                key={`${attr.trait_type}-${attr.value}`}
                label={`${attr.trait_type}: ${attr.value}`} 
                variant="outlined"
              />
            ))}
          </Box>
          
          <MetadataLabel>Created</MetadataLabel>
          <MetadataValue>
            {isLoadingCreationDate ? (
              <CircularProgress size={16} sx={{ mr: 1 }} />
            ) : creationDate}
          </MetadataValue>
          
          <MetadataLabel>Mint ID</MetadataLabel>
          <MetadataValue sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              color: '#8b4513',
              wordBreak: 'break-all',
              flex: 1
            }}>
              <Link
                href={`https://explorer.solana.com/address/${nft.mint}?cluster=mainnet`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'inherit',
                  textDecoration: 'none',
                  display: 'inline-block'
                }}
              >
                {nft.mint}
              </Link>
              <Link 
                href={`https://explorer.solana.com/address/${nft.mint}?cluster=mainnet`} 
                target="_blank"
                rel="noopener noreferrer"
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  color: 'inherit',
                  ml: 1
                }}
              >
                <OpenInNewIcon sx={{ fontSize: '0.9rem', flexShrink: 0 }} />
              </Link>
              <Tooltip title="Copy Mint ID">
                <CopyButton onClick={handleCopyMintId} size="small">
                  <ContentCopyIcon />
                </CopyButton>
              </Tooltip>
            </Box>
          </MetadataValue>
          
          <MetadataLabel>Original Dimensions</MetadataLabel>
          <MetadataValue>{getDimensionsDisplay()}</MetadataValue>
          
          {nft.lastSoldPrice && (
            <>
              <MetadataLabel>Last Sold</MetadataLabel>
              <Typography variant="h6" sx={{ 
                fontFamily: '"Arial", sans-serif',
                color: '#8b4513',
                fontWeight: 600,
                mb: 2
              }}>
                {nft.lastSoldPrice} SOL
              </Typography>
            </>
          )}
        </MetadataSection>
      </DetailContent>

      <TypewriterKeyButton
        onClick={handleDownload}
        aria-label="Download original image"
        title="Download original image"
        sx={{
          bottom: isMobile ? '10px' : '20px',
          right: isMobile ? '10px' : '20px',
        }}
      >
        <KeyboardArrowDownIcon />
      </TypewriterKeyButton>
    </DetailDialog>
  );
};

export default NFTDetailModal; 