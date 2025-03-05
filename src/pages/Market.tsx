import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Card, 
  CardMedia, 
  CardContent, 
  Button, 
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Pagination,
  Chip,
  Alert,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';
import { styled } from '@mui/system';
import { Link } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import { useWalletContext } from '../contexts/WalletContext';
import { Connection, PublicKey } from '@solana/web3.js';
import { listNFTForSale, purchaseNFT, unlistNFT, cleanupBurnedNFTListings, fetchMetaplexListingData, initializeMarketplace, setPurchaseSuccessPopupCallback } from '../api/marketplace';
import { verifyAuctionHouse } from '../api/metaplex';
import { NFTOwner } from '../types/nft';
import axios from 'axios';
import VintageCardComponent from '../components/VintageCard';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { saveCollections, getCollections, getAllListings, getDb } from '../api/storage';
import { getStoredNFTs } from '../utils/storage';
import { getDisplayNameForWallet } from '../utils/displayNames';
import { isOnDefaultAuctionHouse } from '../api/googleSheets';
import { fetchCollections as fetchCollectionsFromApi, addCollection, getUltimateNFTs, Collection as ApiCollection, UltimateNFT } from '../api/collections';
import Layout from '../components/Layout';
import NFTDetailModal from '../components/NFTDetailModal';
import { setPurchaseSuccessPopupCallback as newSetPurchaseSuccessPopupCallback } from "../api/purchaseCallbacks";

// Styled components for vintage look
const PageTitle = styled(Typography)({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '3.3rem',
  fontWeight: '600',
  marginBottom: '1.8rem',
  color: '#262626',
  textAlign: 'center',
  position: 'relative',
  textShadow: '3px 3px 4px rgba(0,0,0,0.2)',
  '@keyframes appear': {
    '0%': { opacity: 0, transform: 'translateY(-20px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' }
  },
  animation: 'appear 1s ease-out forwards',
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '120px',
    height: '3px',
    backgroundColor: '#b8860b',
    animation: 'disappear 2s forwards',
  },
  '@keyframes disappear': {
    from: { opacity: 1 },
    to: { opacity: 0 }
  }
});

const FilterContainer = styled(Box)({
  backgroundColor: '#f8f5e6',
  padding: '1.5rem',
  border: '1px solid #d4af37',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  marginBottom: '2rem',
  borderRadius: '4px',
});

const FilterButton = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
});

const FilterCheckbox = styled('input')({
  accentColor: '#8b4513',
  width: '20px',
  height: '20px',
  marginRight: '8px',
  cursor: 'pointer',
});

const FilterLabel = styled('label')({
  fontFamily: '"Roboto", sans-serif',
  fontSize: '0.9rem',
  color: '#5c4033',
  fontWeight: '500',
  cursor: 'pointer',
});

const VintageCardStyled = styled(Card)({
  backgroundColor: '#f8f5e6',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  border: '1px solid #d4af37',
  transition: 'transform 0.3s ease',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: 0,
  overflow: 'hidden',
  '&:hover': {
    transform: 'translateY(-5px)',
  },
});

const CardMediaContainer = styled(Box)({
  width: '100%',
  flex: '1 1 auto',
  minHeight: '280px', // Increased height for images
  backgroundColor: '#f0ead6',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '4px', // Minimal padding
  overflow: 'hidden',
});

const CardImageWrapper = styled(Box)({
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

const StyledCardMedia = styled('img')({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  display: 'block',
});

const CardTitleContainer = styled(Box)({
  padding: '12px 12px 4px 12px',
});

const CardFooter = styled(Box)({
  padding: '0 12px 12px 12px',
});

const CardTitle = styled(Typography)({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '1.6rem',
  fontWeight: '600',
  color: '#262626',
  textShadow: '2px 2px 3px rgba(0,0,0,0.15)',
});

const CardDescription = styled(Typography)({
  fontFamily: '"Roboto", sans-serif',
  fontSize: '0.9rem',
  color: '#555',
  flexGrow: 1,
});

const PriceTag = styled(Typography)({
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '1.1rem',
  color: '#b8860b',
  fontWeight: 'bold',
});

const VintageButton = styled(Button)({
  fontFamily: '"Arial", "Helvetica", sans-serif',
  fontSize: '0.9rem',
  letterSpacing: '0.05rem',
  fontWeight: '500',
  textTransform: 'uppercase',
  backgroundColor: '#e8e8e8',
  color: '#333333',
  padding: '8px 24px',
  borderRadius: '4px',
  boxShadow: '0 4px 0 #222222',
  border: 'none',
  position: 'relative',
  transition: 'all 0.1s ease',
  '&:hover': {
    backgroundColor: '#f0f0f0',
    boxShadow: '0 4px 0 #222222',
  },
  '&:active': {
    backgroundColor: '#d8d8d8',
    transform: 'translateY(4px)',
    boxShadow: '0 0px 0 #222222',
  },
});

const AttributeChip = styled(Chip)({
  backgroundColor: '#e6ddc4',
  border: '1px solid #b8860b',
  margin: '0.25rem 0.15rem',
  height: '24px',
  fontFamily: '"Roboto", sans-serif',
  fontSize: '0.75rem',
});

// Add styled component for owner label
const OwnerLabel = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  backgroundColor: 'rgba(240, 234, 214, 0.8)',
  borderTop: '1px solid #d4af37',
  fontFamily: '"Arial", "Helvetica", sans-serif',
  fontSize: '0.85rem',
  color: '#555',
});

const OwnerAddress = styled('span')({
  fontWeight: 'bold',
  marginLeft: '4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// Define types that are specific to the Market component
interface Collection {
  id: string;
  collectionId?: string;
  name: string;
  symbol?: string;
  description?: string;
  image?: string;
  firstNftDate?: string;
  createdAt?: string;
  filter?: string;
}

// Update collection type to include ultimates
interface CollectionForDropdown {
  id: string;
  name: string;
  ultimates?: boolean | string;
}

const SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d';

interface NFTAttribute {
  trait_type: string;
  value: string;
}

interface NFTMetadata {
  name?: string;
  description?: string;
  attributes?: NFTAttribute[];
}

interface NFTContent {
  metadata?: NFTMetadata;
  files?: Array<{ uri: string }>;
  json_uri?: string;
}

// Base NFT interface
interface BaseNFT {
  mint: string;
  name: string;
  image?: string;
  description?: string;
  collectionName?: string;
  content?: NFTContent;
  grouping?: Array<{
    group_key: string;
    group_value: string;
    collection_metadata?: { name: string };
  }>;
}

// NFT interface with string or object owner
interface NFT extends BaseNFT {
  owner: string | NFTOwner;
}

// NFT interface with object owner only
interface NFTWithObjectOwner extends BaseNFT {
  owner: NFTOwner;
}

// Define the escrow wallet address as a constant that can be exported and used elsewhere
export const ESCROW_WALLET_ADDRESS = "7TZ6j6kCTEvjH5pQ17AssZEySb3dL3UjtoHYcCKN3ijQ";

// Convert an NFT with string owner to one with object owner
const convertToNFTWithObjectOwner = (nft: NFT): NFTWithObjectOwner => {
  const { owner, ...rest } = nft;
  const ownerStr = typeof owner === 'string' ? owner : owner.publicKey;
  return {
    ...rest,
    owner: {
      publicKey: ownerStr,
      // Don't include displayName here - let components fetch it when needed
    }
  };
};

// Convert an NFT with object owner back to standard NFT
const convertToStandardNFT = (nft: NFTWithObjectOwner): NFT => {
  const { owner, ...rest } = nft;
  return {
    ...rest,
    owner: owner.publicKey
  };
};

const Market: React.FC = () => {
  const { wallet, connected } = useWalletContext();
  const connection = new Connection(SOLANA_RPC_URL, 'finalized');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [collections, setCollections] = useState<CollectionForDropdown[]>([]);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [filteredNfts, setFilteredNfts] = useState<NFT[]>([]);
  const [displayNamesVersion, setDisplayNamesVersion] = useState(0);
  const [showMyNFTs, setShowMyNFTs] = useState(false);
  
  // Add new state variables for tracking progress
  const [listingInProgress, setListingInProgress] = useState(false);
  const [unlistingInProgress, setUnlistingInProgress] = useState(false);
  const [purchaseInProgress, setPurchaseInProgress] = useState(false);
  
  const itemsPerPage = 6;
  
  // Add auction house check state
  const [checking, setChecking] = useState(false);
  const [auctionHouseValid, setAuctionHouseValid] = useState(true);
  
  // Inside the Market component, add these state variables
  const [showListedOnly, setShowListedOnly] = useState(false);
  const [initializationAttempts, setInitializationAttempts] = useState(0);
  const MAX_INIT_RETRIES = 3;
  
  // Fetch collections from IndexedDB instead of localStorage
  const fetchCollections = async () => {
    try {
      return await getCollections();
    } catch (err) {
      console.error('Error fetching collections from IndexedDB:', err);
      setError('Failed to fetch collections. Please try again.');
      return [];
    }
  };
  
  // Get a friendly name for a collection ID
  const getCollectionName = (collectionId: string): string => {
    // Try to get the name from localStorage (Mint page's collections)
    try {
      const storedCollections = localStorage.getItem('collections');
      if (storedCollections) {
        const collections = JSON.parse(storedCollections);
        const match = collections.find((c: any) => c.collectionId === collectionId);
        if (match && match.name) {
          return match.name;
        }
      }
    } catch (err) {
      console.error('Error getting collection name from localStorage:', err);
    }
    
    // If not found, return a formatted version of the ID
    return collectionId.length > 10 ? 
      `${collectionId.substring(0, 6)}...${collectionId.substring(collectionId.length - 4)}` : 
      collectionId;
  };
  
  // Fetch NFTs from a collection using Helius API
  const fetchNFTsForCollection = async (collectionId: string, collectionName: string) => {
    console.log(`[fetchNFTsForCollection] Starting fetch for collection: ${collectionId} (${collectionName})`);
    try {
      // First check if this collection has ultimates enabled
      const collections: ApiCollection[] = await fetchCollectionsFromApi();
      const collection = collections.find(c => c.address === collectionId);
      
      if (!collection) {
        console.warn(`[fetchNFTsForCollection] Collection ${collectionId} not found in Google Sheets`);
        return [];
      }

      console.log(`[fetchNFTsForCollection] Collection found:`, collection);

      // If collection has ultimates enabled, only fetch those NFTs
      if (collection.ultimates === 'TRUE' || collection.ultimates === true) {
        console.log('[fetchNFTsForCollection] Collection has ultimates enabled, fetching only ultimate NFTs');
        const ultimateNFTs = await getUltimateNFTs(collectionId);
        console.log(`[fetchNFTsForCollection] Ultimate NFTs fetched:`, ultimateNFTs);
        
        if (!ultimateNFTs.length) {
          console.log('[fetchNFTsForCollection] No ultimate NFTs found for collection');
          return [];
        }

        // Helper function to fetch NFT with retries
        const fetchNFTWithRetries = async (nftAddress: string, ultimate: UltimateNFT, retries = 3): Promise<any> => {
          try {
            const response = await axios.post(SOLANA_RPC_URL, {
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getAsset',
              params: {
                id: nftAddress,
                options: {
                  showFungible: false,
                  showNativeBalance: false,
                  showCollectionMetadata: true,
                  showUnverifiedCollections: true
                }
              }
            }, {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            });

            if (!response.data.result) {
              throw new Error('No data returned from Helius');
            }

            const nft = response.data.result;
            console.log(`[fetchNFTsForCollection] Raw NFT data:`, nft);

            return {
              ...nft,
              owner: ultimate.owner || nft.ownership?.owner || null,
              mint: nft.id,
              name: nft.content?.metadata?.name || ultimate.name || '',
              title: nft.content?.metadata?.name || ultimate.name || '',
              description: nft.content?.metadata?.description || '',
              attributes: nft.content?.metadata?.attributes || [],
              image: nft.content?.files?.[0]?.uri || nft.content?.json_uri || '',
              traits: nft.content?.metadata?.attributes?.map((attr: any) => ({
                trait_type: attr.trait_type,
                value: attr.value
              })) || [],
              content: {
                ...nft.content,
                metadata: {
                  ...nft.content?.metadata,
                  name: nft.content?.metadata?.name || ultimate.name || ''
                }
              },
              collectionName: collection.name
            };
          } catch (err) {
            if (retries > 0) {
              console.log(`[fetchNFTWithRetries] Retrying fetch for NFT ${nftAddress}, ${retries} attempts remaining`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              return fetchNFTWithRetries(nftAddress, ultimate, retries - 1);
            }
            throw err;
          }
        };

        // Fetch each ultimate NFT individually with retries
        console.log('[fetchNFTsForCollection] Fetching metadata for each ultimate NFT...');
        const nftPromises = ultimateNFTs.map(async (ultimate: UltimateNFT) => {
          try {
            console.log(`[fetchNFTsForCollection] Fetching metadata for NFT: ${ultimate.nft_address}`);
            const nft = await fetchNFTWithRetries(ultimate.nft_address, ultimate);
            
            if (!nft) {
              console.warn(`[fetchNFTsForCollection] No data returned for NFT ${ultimate.nft_address}`);
              // Return a fallback NFT object with the data we have from Google Sheets
              return {
                mint: ultimate.nft_address,
                name: ultimate.name || 'Unknown NFT',
                title: ultimate.name || 'Unknown NFT',
                owner: ultimate.owner || null,
                image: '', // No image available
                description: 'NFT metadata temporarily unavailable',
                attributes: [],
                traits: [],
                content: {
                  metadata: {
                    name: ultimate.name || 'Unknown NFT'
                  }
                },
                collectionName: collection.name
              };
            }

            console.log(`[fetchNFTsForCollection] Successfully transformed NFT:`, nft);
            return nft;
          } catch (err) {
            console.error(`[fetchNFTsForCollection] Error fetching ultimate NFT ${ultimate.nft_address}:`, err);
            // Return a fallback NFT object with the data we have from Google Sheets
            return {
              mint: ultimate.nft_address,
              name: ultimate.name || 'Unknown NFT',
              title: ultimate.name || 'Unknown NFT',
              owner: ultimate.owner || null,
              image: '', // No image available
              description: 'NFT metadata temporarily unavailable',
              attributes: [],
              traits: [],
              content: {
                metadata: {
                  name: ultimate.name || 'Unknown NFT'
                }
              },
              collectionName: collection.name
            };
          }
        });

        const nfts = (await Promise.all(nftPromises)).filter(nft => nft !== null);
        console.log(`[fetchNFTsForCollection] Added ${nfts.length} ultimate NFTs from collection ${collection.name}`);
        return nfts;
      }

      // If ultimates not enabled, fetch all NFTs as before
      const response = await axios.post(SOLANA_RPC_URL, {
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionId,
          page: 1,
          limit: 1000,
          options: {
            showFungible: false,
            showNativeBalance: false,
            showCollectionMetadata: true,
            showUnverifiedCollections: true
          }
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.result?.items) {
        console.warn(`No items returned for collection ${collectionId}`);
        return [];
      }

      // Transform the response to include proper owner information
      const nfts = response.data.result.items.map((nft: any) => ({
        ...nft,
        owner: nft.ownership?.owner || null,
        mint: nft.id,
        name: nft.content?.metadata?.name || nft.name || '',
        title: nft.content?.metadata?.name || nft.name || '',
        description: nft.content?.metadata?.description || '',
        attributes: nft.content?.metadata?.attributes || [],
        image: nft.content?.files?.[0]?.uri || nft.content?.json_uri || '',
        traits: nft.content?.metadata?.attributes?.map((attr: any) => ({
          trait_type: attr.trait_type,
          value: attr.value
        })) || [],
        content: {
          ...nft.content,
          metadata: {
            ...nft.content?.metadata,
            name: nft.content?.metadata?.name || nft.name || ''
          }
        },
        // Add collection name from Google Sheets data
        collectionName: collection.name
      }));

      if (nfts.length > 0) {
        console.log(`Added ${nfts.length} regular NFTs from collection ${collection.name}`);
      }

      return nfts;
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      return [];
    }
  };
  
  // Display name change listener
  useEffect(() => {
    // Function to handle storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userDisplayNames') {
        console.log('Display names updated, refreshing NFT data');
        setDisplayNamesVersion(prev => prev + 1); // Increment to trigger a refresh
      }
    };

    // Also check for changes made in the same window
    const checkForLocalChanges = () => {
      const currentDisplayNames = localStorage.getItem('userDisplayNames');
      if (currentDisplayNames) {
        // This will trigger a re-fetch when display names are updated in this window
        setDisplayNamesVersion(prev => prev + 1);
      }
    };
    
    // Set up listener for storage events (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);
    
    // Set up custom event listener for same-window changes
    window.addEventListener('displayNamesUpdated', checkForLocalChanges);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('displayNamesUpdated', checkForLocalChanges);
    };
  }, []);
  
  // Re-fetch NFTs when display names change
  useEffect(() => {
    if (displayNamesVersion > 0) {
      fetchAllNFTs();
    }
  }, [displayNamesVersion]);
  
  // Initial fetch
  useEffect(() => {
    const setupMarketplace = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Initialize marketplace first
        let initSuccess = false;
        try {
          await initializeMarketplace();
          console.log('Marketplace initialized successfully');
          initSuccess = true;
        } catch (error) {
          console.error('Failed to initialize marketplace:', error);
          if (initializationAttempts < MAX_INIT_RETRIES) {
            setInitializationAttempts(prev => prev + 1);
            console.log(`Retrying marketplace initialization (attempt ${initializationAttempts + 1}/${MAX_INIT_RETRIES})`);
            setTimeout(setupMarketplace, 2000); // Retry after 2 seconds
            return;
          }
          throw error;
        }
        
        if (!initSuccess) {
          throw new Error('Failed to initialize marketplace after retries');
        }
        
        // Then verify auction house
        try {
          await verifyAuctionHouse(connection);
          console.log('Auction house verified successfully');
          setAuctionHouseValid(true);
        } catch (error) {
          console.error('Failed to verify auction house:', error);
          setAuctionHouseValid(false);
          // Don't throw here, continue with other initialization steps
        }
        
        // Check for and restore any backup
        try {
          await checkForBackup();
          console.log('Backup check completed');
        } catch (error) {
          console.warn('Non-critical error checking backup:', error);
          // Don't throw here, continue with other initialization steps
        }
        
        // Clean up any burned NFT listings
        try {
          const nftAddresses = nfts.map(nft => nft.mint);
          await cleanupBurnedNFTListings(nftAddresses);
        } catch (error) {
          console.warn('Non-critical error cleaning up burned NFT listings:', error);
          // Don't throw here, continue with other initialization steps
        }
        
        // Finally, fetch NFTs
        try {
          await fetchAllNFTs();
          setSuccess('Marketplace initialized successfully');
        } catch (error) {
          console.error('Error fetching NFTs:', error);
          setError('Failed to fetch NFTs. Please try refreshing the page.');
          // Don't throw here, we've already set the error state
        }
      } catch (error) {
        console.error('Critical marketplace initialization error:', error);
        setError('Failed to initialize marketplace. Please check your connection and try again.');
        setAuctionHouseValid(false);
      } finally {
        setLoading(false);
      }
    };
    
    setupMarketplace();
    
    // Cleanup function for when component unmounts
    return () => {
      console.log('Market component unmounted');
    };
  }, []);

  // Fetch NFTs when wallet connection changes
  useEffect(() => {
    if (connected) {
      fetchAllNFTs();
    }
  }, [connected]);
  
  // Fetch all NFTs from Helius API and apply listings from Metaplex
  const fetchAllNFTs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get collections directly from Google Sheets API
      const apiCollections = await fetchCollectionsFromApi();
      console.log(`Fetched ${apiCollections.length} collections from Google Sheets API`);
      
      if (!apiCollections || apiCollections.length === 0) {
        console.log('No collections found in Google Sheets');
        setNfts([]);
        setFilteredNfts([]);
        setLoading(false);
        return;
      }

      // Convert API collections to the format expected by the Market page
      const validCollections = apiCollections.map(collection => ({
        id: collection.address,
        name: collection.name,
        image: collection.image || '',
        description: collection.description || '',
        collectionId: collection.address,
        ultimates: collection.ultimates
      }));
      
      // Update where collections are set for dropdown
      const collectionsForDropdown = validCollections.map(collection => ({
        id: collection.id,
        name: collection.name,
        ultimates: collection.ultimates
      }));
      setCollections(collectionsForDropdown);

      // Initialize array to store all NFTs
      let allNFTs: any[] = [];

      // Fetch NFTs for each valid collection
      for (const collection of validCollections) {
        const collectionId = collection.id || collection.collectionId;
        if (!collectionId) {
          console.warn('Skipping collection with no ID:', collection);
          continue;
        }

        // Check if collection has ultimates enabled
        if (collection.ultimates === 'TRUE' || collection.ultimates === true) {
          try {
            console.log(`Collection ${collectionId} has ultimates enabled, fetching only from ultimates sheet`);
            const ultimateNFTs = await getUltimateNFTs(collectionId);
            
            if (ultimateNFTs.length > 0) {
              // If the NFT already has an owner from the sheet, use that instead of fetching
              const nftPromises = ultimateNFTs.map(async (ultimate: UltimateNFT) => {
                try {
                  const response = await axios.post(SOLANA_RPC_URL, {
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAsset',
                    params: {
                      id: ultimate.nft_address,
                      options: {
                        showFungible: false,
                        showNativeBalance: false,
                        showCollectionMetadata: true,
                        showUnverifiedCollections: true
                      }
                    }
                  }, {
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });

                  if (!response.data.result) {
                    console.warn(`No data returned for NFT ${ultimate.nft_address}`);
                    // Return a fallback NFT object with the data we have from Google Sheets
                    return {
                      mint: ultimate.nft_address,
                      name: ultimate.name || 'Unknown NFT',
                      title: ultimate.name || 'Unknown NFT',
                      owner: ultimate.owner || null,
                      image: '', // No image available
                      description: 'NFT metadata temporarily unavailable',
                      attributes: [],
                      traits: [],
                      content: {
                        metadata: {
                          name: ultimate.name || 'Unknown NFT'
                        }
                      },
                      collectionName: collection.name
                    };
                  }

                  const nft = response.data.result;
                  console.log(`[fetchAllNFTs] Raw NFT data for ${ultimate.nft_address}:`, nft);

                  // Transform the NFT data to match our expected format
                  return {
                    ...nft,
                    owner: ultimate.owner || nft.ownership?.owner || null,
                    mint: nft.id,
                    name: nft.content?.metadata?.name || ultimate.name || '',
                    title: nft.content?.metadata?.name || ultimate.name || '',
                    description: nft.content?.metadata?.description || '',
                    attributes: nft.content?.metadata?.attributes || [],
                    image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || '',
                    traits: nft.content?.metadata?.attributes?.map((attr: any) => ({
                      trait_type: attr.trait_type,
                      value: attr.value
                    })) || [],
                    content: {
                      ...nft.content,
                      metadata: {
                        ...nft.content?.metadata,
                        name: nft.content?.metadata?.name || ultimate.name || '',
                        description: nft.content?.metadata?.description || '',
                        attributes: nft.content?.metadata?.attributes || []
                      }
                    },
                    grouping: nft.grouping || [],
                    collectionName: collection.name
                  };
                } catch (err) {
                  console.error(`Error fetching ultimate NFT ${ultimate.nft_address}:`, err);
                  // Return a fallback NFT object with the data we have from Google Sheets
                  return {
                    mint: ultimate.nft_address,
                    name: ultimate.name || 'Unknown NFT',
                    title: ultimate.name || 'Unknown NFT',
                    owner: ultimate.owner || null,
                    image: '', // No image available
                    description: 'NFT metadata temporarily unavailable',
                    attributes: [],
                    traits: [],
                    content: {
                      metadata: {
                        name: ultimate.name || 'Unknown NFT'
                      }
                    },
                    collectionName: collection.name
                  };
                }
              });

              const nfts = (await Promise.all(nftPromises)).filter(nft => nft !== null);
              allNFTs = [...allNFTs, ...nfts];
              console.log(`Added ${nfts.length} ultimate NFTs from collection ${collection.name}`);
            } else {
              console.log(`No ultimate NFTs found for collection ${collection.name}`);
            }
          } catch (err) {
            console.error(`Error fetching ultimate NFTs for collection ${collectionId}:`, err);
          }
        } else {
          // Regular collection loading for non-ultimates collections
          try {
            console.log(`Fetching regular NFTs for collection: ${collectionId} (${collection.name || 'Unnamed'})`);
            const response = await axios.post(SOLANA_RPC_URL, {
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getAssetsByGroup',
              params: {
                groupKey: 'collection',
                groupValue: collectionId,
                page: 1,
                limit: 1000,
                displayOptions: {
                  showUnverifiedCollections: true,
                  showCollectionMetadata: true,
                  showFungible: false,
                }
              }
            }, {
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (!response.data.result?.items) {
              console.warn(`No items returned for collection ${collectionId}`);
              continue;
            }

            const nfts = response.data.result.items.map((nft: any) => ({
              ...nft,
              owner: nft.ownership?.owner || null,
              mint: nft.id,
              name: nft.content?.metadata?.name || nft.name || '',
              title: nft.content?.metadata?.name || nft.name || '',
              description: nft.content?.metadata?.description || '',
              attributes: nft.content?.metadata?.attributes || [],
              image: nft.content?.files?.[0]?.uri || nft.content?.json_uri || '',
              traits: nft.content?.metadata?.attributes?.map((attr: any) => ({
                trait_type: attr.trait_type,
                value: attr.value
              })) || [],
              content: {
                ...nft.content,
                metadata: {
                  ...nft.content?.metadata,
                  name: nft.content?.metadata?.name || nft.name || '',
                  description: nft.content?.metadata?.description || '',
                  attributes: nft.content?.metadata?.attributes || []
                }
              },
              collectionName: collection.name
            }));

            if (nfts.length > 0) {
              allNFTs = [...allNFTs, ...nfts];
              console.log(`Added ${nfts.length} regular NFTs from collection ${collection.name}`);
            }
          } catch (err) {
            console.error(`Error fetching regular NFTs for collection ${collectionId}:`, err);
          }
        }
      }

      if (allNFTs.length === 0) {
        console.log('No NFTs found in any collections');
        setNfts([]);
        setFilteredNfts([]);
        setLoading(false);
        return;
      }

      // Try to fetch Metaplex listings
      try {
        const nftsWithListings = await fetchMetaplexListingData(allNFTs, connection);
        setNfts(nftsWithListings);
        setFilteredNfts(nftsWithListings);
        console.log('NFTs with listings loaded:', nftsWithListings.length);
      } catch (err) {
        console.warn('Error fetching Metaplex listings, continuing with basic NFT data:', err);
        setNfts(allNFTs);
        setFilteredNfts(allNFTs);
      }
    } catch (err) {
      console.error('Error fetching NFTs:', err);
      setError('Failed to fetch NFTs. Please try again.');
      setNfts([]);
      setFilteredNfts([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Update the filtering logic
  useEffect(() => {
    if (nfts.length > 0) {
      const invalidNfts = nfts.filter(nft => {
        if (!nft.owner) {
          console.warn('NFT missing owner:', nft);
          return true;
        }
        if (typeof nft.owner === 'string' && !nft.owner.trim()) {
          console.warn('NFT has empty string owner:', nft);
          return true;
        }
        if (typeof nft.owner === 'object' && !nft.owner.publicKey) {
          console.warn('NFT has invalid owner object:', nft);
          return true;
        }
        return false;
      });

      if (invalidNfts.length > 0) {
        console.warn(`Found ${invalidNfts.length} NFTs with invalid owner information`);
      }

      let filtered = [...nfts].filter(nft => {
        // Filter out NFTs with invalid owner information
        if (!nft.owner) return false;
        if (typeof nft.owner === 'string' && !nft.owner.trim()) return false;
        if (typeof nft.owner === 'object' && !nft.owner.publicKey) return false;
        return true;
      });
      
      // Apply search term filter
      if (searchTerm) {
        filtered = filtered.filter(nft =>
          nft.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (nft.description || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      // Apply collection filter
      if (selectedCollection !== 'all') {
        console.log('Filtering by collection:', selectedCollection);
        filtered = filtered.filter(nft => {
          const grouping = nft.grouping?.find(g => g.group_key === 'collection');
          const collectionFromGrouping = (grouping as any)?.collection_metadata?.name;
          const collectionName = nft.collectionName || collectionFromGrouping;
          return collectionName === selectedCollection;
        });
        console.log('Filtered NFTs count:', filtered.length);
      }
      
      // Apply my NFTs filter
      if (showMyNFTs && wallet?.publicKey) {
        filtered = filtered.filter(nft => {
          const owner = typeof nft.owner === 'string' 
            ? nft.owner 
            : nft.owner.publicKey;
          return owner === wallet.publicKey?.toString();
        });
      }
      
      // Apply sorting
      filtered = sortNFTs(filtered);
      
      setFilteredNfts(filtered);
    }
  }, [searchTerm, selectedCollection, nfts, showMyNFTs, wallet?.publicKey, collections]);
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredNfts.length / itemsPerPage);
  const displayedNfts = filteredNfts.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );
  
  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle data backup
  const handleBackupData = async () => {
    try {
      setLoading(true);
      
      // Get collections from localStorage and listings from IndexedDB
      const storedCollections = localStorage.getItem('collections');
      const listings = await getAllListings();
      
      if (!storedCollections) {
        setError('No collections found to backup');
        setLoading(false);
        return;
      }
      
      // Create backup data
      const backupData = {
        collections: JSON.parse(storedCollections),
        listings: listings
      };
      
      // Convert to JSON and create download link
      const jsonData = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'degen-poet-marketplace-backup.json';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      setLoading(false);
    } catch (err) {
      console.error('Error backing up data:', err);
      setError('Failed to backup marketplace data');
    }
  };
  
  // Handle data restoration
  const handleRestoreData = () => {
    try {
      setLoading(true);
      
      // Create file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.onchange = async (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (file) {
          try {
            // Read the file
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                const jsonData = e.target?.result as string;
                const backupData = JSON.parse(jsonData);
                
                // Validate data structure
                if (!backupData.collections || !Array.isArray(backupData.collections) || 
                    !backupData.listings || !Array.isArray(backupData.listings)) {
                  throw new Error('Invalid backup file format');
                }
                
                // Restore collections to localStorage
                localStorage.setItem('collections', JSON.stringify(backupData.collections));
                
                // Restore listings to IndexedDB
                const db = await getDb();
                const tx = db.transaction('listings', 'readwrite');
                const store = tx.objectStore('listings');
                
                // Clear existing listings
                await store.clear();
                
                // Add each listing
                for (const listing of backupData.listings) {
                  await store.add(listing);
                }
                
                await tx.done;
                
                // Update IndexedDB collections list for Market page
                const collectionIds = backupData.collections.map((c: any) => c.collectionId);
                await saveCollections(collectionIds);
                
                console.log('Marketplace data successfully restored');
                setLoading(false);
              } catch (parseError) {
                console.error('Error parsing backup file:', parseError);
                setError('Invalid backup file format');
              }
            };
            reader.readAsText(file);
          } catch (fileError) {
            console.error('Error reading backup file:', fileError);
            setError('Failed to read backup file');
          }
        }
        
        // Clean up
        document.body.removeChild(fileInput);
        setLoading(false);
      };
      
      // Trigger file selection
      document.body.appendChild(fileInput);
      fileInput.click();
    } catch (err) {
      console.error('Error restoring data:', err);
      setError('Failed to restore marketplace data');
      setLoading(false);
    }
  };

  // Add this function to automatically backup data periodically
  const setupAutomaticBackup = () => {
    // Check if we should perform an automatic backup
    const performBackup = async () => {
      try {
        // Get collections from localStorage and listings from IndexedDB
        const storedCollections = localStorage.getItem('collections');
        const listings = await getAllListings();
        
        if (!storedCollections) {
          console.log('No collections to backup');
          return;
        }
        
        // Create backup data
        const backupData = {
          collections: JSON.parse(storedCollections),
          listings: listings,
          timestamp: new Date().toISOString()
        };
        
        // Save to localStorage as a fallback storage
        localStorage.setItem('marketplace_backup', JSON.stringify(backupData));
        console.log('Automatic backup completed to localStorage');
        
        // Also save to sessionStorage which persists across page refreshes but clears when browser is closed
        sessionStorage.setItem('marketplace_backup', JSON.stringify(backupData));
        
        // Remove the automatic file download - we don't want to prompt or notify the user
        
      } catch (err) {
        console.error('Error during automatic backup:', err);
      }
    };
    
    // Perform backup every 5 minutes and when the page is about to unload
    const backupInterval = setInterval(performBackup, 5 * 60 * 1000);
    window.addEventListener('beforeunload', performBackup);
    
    // Initial backup
    performBackup();
    
    // Return cleanup function
    return () => {
      clearInterval(backupInterval);
      window.removeEventListener('beforeunload', performBackup);
    };
  };

  // Add this function to check for and restore backups on startup
  const checkForBackup = async () => {
    try {
      // Check if we have collections in Google Sheets API
      const apiCollections = await fetchCollectionsFromApi();
      
      // If we already have collections in Google Sheets, no need to restore
      if (apiCollections.length > 0) {
        console.log('Collections already exist in Google Sheets API, no need to restore from backup');
        return;
      }
      
      // Try to get backup from localStorage first
      let backupData = localStorage.getItem('marketplace_backup');
      
      // If not in localStorage, try sessionStorage
      if (!backupData) {
        console.log('No backup found in localStorage, checking sessionStorage...');
        backupData = sessionStorage.getItem('marketplace_backup');
      }
      
      // If no backup found, just exit silently - don't prompt the user
      if (!backupData) {
        console.log('No backup found, continuing without restoration');
        return;
      }
      
      const backup = JSON.parse(backupData);
      
      // Validate backup data
      if (!backup.collections || !Array.isArray(backup.collections) || 
          !backup.listings || !Array.isArray(backup.listings)) {
        console.error('Invalid backup data format');
        return;
      }
      
      console.log('Found valid backup, restoring...');
      
      // Restore collections to Google Sheets API
      for (const collection of backup.collections) {
        // Update addCollection to include ultimates
        const newCollection: ApiCollection = {
          address: collection.collectionId,
          name: collection.name || '',
          description: '',
          addedAt: Date.now(),
          ultimates: false
        };
        await addCollection(newCollection);
      }
      
      // Restore listings to IndexedDB
      const db = await getDb();
      const tx = db.transaction('listings', 'readwrite');
      const store = tx.objectStore('listings');
      
      // Clear existing listings
      await store.clear();
      
      // Add each listing
      for (const listing of backup.listings) {
        await store.add(listing);
      }
      
      await tx.done;
      
      // Also save to localStorage and sessionStorage for future use
      localStorage.setItem('marketplace_backup', backupData);
      sessionStorage.setItem('marketplace_backup', backupData);
      
      console.log('Marketplace data successfully restored from backup');
      
    } catch (err) {
      console.error('Error checking for or restoring backup:', err);
    }
  };

  const checkAuctionHouse = async () => {
    setChecking(true);
    try {
      // No need to check auction house in Google Sheets implementation
      // Just set it to valid
      setAuctionHouseValid(true);
    } catch (error) {
      console.error("Error checking auction house:", error);
      setAuctionHouseValid(false);
    } finally {
      setChecking(false);
    }
  };

  const fetchNFTs = async () => {
    try {
      // Clear any existing errors
      setError(null);
      setLoading(true);
      
      // Get all NFTs from indexedDB or local storage
      const storedNFTs = await getStoredNFTs();
      const allNFTs: NFT[] = storedNFTs || [];

      console.log(`Found ${allNFTs.length} NFTs in storage`);
      
      // Apply filters and search
      let filteredResults = allNFTs;
      
      // ... rest of the function unchanged

      setLoading(false);
    } catch (error) {
      console.error('Error loading NFTs:', error);
      setError('Failed to load NFTs. Please try again later.');
      setLoading(false);
    }
  };

  // Add a notification helper function
  const showNotification = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    if (type === 'success') {
      setSuccess(message);
    } else if (type === 'error') {
      setError(message);
    }
    // Could handle other notification types if needed
  };

  // Add helper function to get unique collections by name
  const getUniqueCollectionsByName = (collections: CollectionForDropdown[]): CollectionForDropdown[] => {
    const uniqueNames = new Set(collections.map(c => c.name));
    return Array.from(uniqueNames)
      .sort((a, b) => a.localeCompare(b)) // Sort alphabetically
      .map(name => ({
        id: collections.find(c => c.name === name)?.id || '',
        name: name,
        ultimates: collections.find(c => c.name === name)?.ultimates || false
      }));
  };

  // Add sorting function for NFTs
  const sortNFTs = (nfts: NFT[]): NFT[] => {
    return [...nfts].sort((a, b) => {
      // First sort by collection name
      const collectionA = a.collectionName || '';
      const collectionB = b.collectionName || '';
      const collectionCompare = collectionA.localeCompare(collectionB);
      
      if (collectionCompare !== 0) {
        return collectionCompare;
      }
      
      // Then sort by creation date within collection
      const dateA = a.content?.metadata?.attributes?.find((attr: NFTAttribute) => attr.trait_type === 'created')?.value || '';
      const dateB = b.content?.metadata?.attributes?.find((attr: NFTAttribute) => attr.trait_type === 'created')?.value || '';
      
      // Sort in descending order (most recent first)
      return dateB.localeCompare(dateA);
    });
  };

  return (
    <Box>
      <PageTitle variant="h1">Degen Poet NFTs</PageTitle>
      
      <FilterContainer>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              label="Search NFTs"
              variant="outlined"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth variant="outlined">
              <InputLabel id="collection-select-label">Collection</InputLabel>
              <Select
                labelId="collection-select-label"
                id="collection-select"
                value={selectedCollection}
                label="Collection"
                onChange={(e) => setSelectedCollection(e.target.value)}
              >
                <MenuItem value="all">All Collections</MenuItem>
                {getUniqueCollectionsByName(collections).map((collection) => (
                  <MenuItem 
                    key={collection.name} 
                    value={collection.name}
                  >
                    {collection.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <FilterButton>
              <Box sx={{ display: 'flex', alignItems: 'center', mx: 1 }}>
                <FilterCheckbox 
                  type="checkbox" 
                  id="my-nfts-filter" 
                  checked={showMyNFTs}
                  onChange={() => setShowMyNFTs(!showMyNFTs)}
                />
                <FilterLabel htmlFor="my-nfts-filter">My NFTs</FilterLabel>
              </Box>
            </FilterButton>
          </Grid>
        </Grid>
      </FilterContainer>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : displayedNfts.length === 0 ? (
        <Box sx={{ textAlign: 'center', my: 4 }}>
          <Typography variant="h6" color="text.secondary">
            No NFTs found matching your criteria
          </Typography>
        </Box>
      ) : (
        <>
          <Grid container spacing={4}>
            {displayedNfts.map((nft) => (
              <Grid item xs={12} sm={6} md={4} key={`${nft.mint}-${nft.owner}`}>
                <VintageCardComponent
                  nft={nft}
                  wallet={wallet}
                  connected={connected}
                />
              </Grid>
            ))}
          </Grid>
          
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size="large"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

// Add custom event to trigger refresh when display names are updated
export const notifyDisplayNameUpdated = () => {
  // Dispatch a custom event that our listener will respond to
  window.dispatchEvent(new CustomEvent('displayNamesUpdated'));
  console.log('Display name updated event dispatched');
};

export default Market; 