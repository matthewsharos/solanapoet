import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { styled } from '@mui/material/styles';
import {
  Box,
  Container,
  Grid,
  Typography,
  CircularProgress,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Pagination,
  Button,
  IconButton,
  InputAdornment,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon, Sort as SortIcon } from '@mui/icons-material';
import type { NFT, NFTOwner, NFTAttribute } from '../types/nft';
import VintageCard from '../components/VintageCard';
import { useWalletContext } from '../contexts/WalletContext';
import { fetchCollectionNFTs as fetchCollectionNFTsFromUtils, NFTMetadata } from '../utils/nftUtils';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';
import { useTheme, useMediaQuery } from '@mui/material';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { enhancedSortNFTsByCreationDate, processBatchWithSorting } from '../utils/nftSorting';

// TypeScript declaration for the global image cache
declare global {
  interface Window {
    nftImageCache: Map<string, boolean>;
  }
}

// Define types from removed imports
interface Collection {
  address: string;
  name: string;
  image?: string;
  description?: string;
  addedAt?: number;
  creationDate?: string;
  ultimates?: boolean;
  collectionId?: string;
  firstNftDate?: string;
  type?: string;
}

interface UltimateNFT {
  "NFT Address": string;
  "Name": string;
  "Owner": string;
  "collection_id": string;
}

// API Response Types
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

interface CollectionApiResponse {
  success: boolean;
  message?: string;
  length?: number;
  sample?: Collection | null;
  collections: Collection[];
}

interface UltimatesApiResponse extends ApiResponse<UltimateNFT[]> {}

interface NFTApiResponse extends ApiResponse<never> {
  nft: {
    id?: string;
    mint?: string;
    name?: string;
    description?: string;
    image?: string;
    attributes?: NFTAttribute[];
    owner: string | NFTOwner;
    collection?: {
      name?: string;
      address?: string;
    };
    creators?: Array<{
      address: string;
      share: number;
      verified: boolean;
    }>;
    royalty?: number;
    tokenStandard?: string;
    content?: {
      files?: Array<{ uri: string; type: string }>;
      metadata?: {
        name?: string;
        description?: string;
        image?: string;
        attributes?: NFTAttribute[];
        created_at?: string;
      };
    };
    compression?: {
      created_at?: string;
    };
  };
}

// Define a main container for consistent styling
const MainContainer = styled(Container)(({ theme }) => ({
  paddingTop: theme.spacing(4),
  paddingBottom: theme.spacing(8),
  [theme.breakpoints.down('sm')]: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(4),
  },
}));

const StyledGrid = styled(Grid)(({ theme }) => ({
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    marginTop: theme.spacing(1),
  },
}));

const LoadingContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  marginTop: theme.spacing(4),
  marginBottom: theme.spacing(4),
}));

// Various API and helper functions

// Returns all collections for marketplace
const getUltimateAndRegularCollections = async (): Promise<Collection[]> => {
  try {
    const endpoint = `${process.env.NEXT_PUBLIC_POET_API_URL}/collections/market`;
    const response = await axios.get<CollectionApiResponse>(endpoint);
    
    if (response.data.success && response.data.collections) {
      return response.data.collections;
    }
    return [];
  } catch (error) {
    console.error("Error fetching collections:", error);
    return [];
  }
};

// Fetches NFTs by collection name
const fetchNFTsByCollection = async (collectionName: string): Promise<NFT[]> => {
  try {
    // Exponential backoff for retries
    const maxRetries = 3;
    let retryCount = 0;
    let delay = 1000; // Start with 1 second delay
    
    while (retryCount < maxRetries) {
      try {
        const result = await fetchCollectionNFTsFromUtils(collectionName);
        // Convert NFTMetadata[] to NFT[]
        return result.map(item => {
          // Create a properly typed NFT object from NFTMetadata
          const nft: NFT = {
            mint: item.mint,
            name: item.name,
            description: item.description || '',
            image: item.image,
            attributes: [], // Will be empty since not in NFTMetadata
            owner: item.owner || '',
            listed: false,
            collectionName: collectionName,
            collectionAddress: '', // Not available directly
            creators: [], // Not available directly
            royalty: null, // Not available directly
            tokenStandard: null, // Not available directly
            createdAt: item.createdAt,
          };
          
          return nft;
        });
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) throw error;
        
        console.log(`Retry ${retryCount} for collection ${collectionName} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    
    // This should not be reached due to the throw in the loop, but TypeScript requires a return
    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for collection ${collectionName}:`, error);
    return [];
  }
};

const Market: React.FC = () => {
  // State for loading and data management
  const [loadedNFTs, setLoadedNFTs] = useState<NFT[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<NFT[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [sorted, setSorted] = useState(false);
  
  // Get display names for wallet context
  const { publicKey, connected } = useWalletContext();
  
  // Theme for responsive design
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Computed properties
  const totalPages = useMemo(() => {
    return Math.ceil(filteredNFTs.length / itemsPerPage);
  }, [filteredNFTs, itemsPerPage]);
  
  // Current page slice of NFTs to display
  const currentNFTs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNFTs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNFTs, currentPage, itemsPerPage]);
  
  // Initialize the global image cache if it doesn't exist
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.nftImageCache) {
      window.nftImageCache = new Map<string, boolean>();
    }
  }, []);
  
  // Handle page change
  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    setCurrentPage(value);
    // Scroll to top when changing pages
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };
  
  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value.trim().toLowerCase();
    setSearchQuery(query);
    
    if (!query) {
      setFilteredNFTs(loadedNFTs);
    } else {
      const filtered = loadedNFTs.filter(nft => {
        // Search across multiple fields
        return (
          nft.name.toLowerCase().includes(query) ||
          nft.description?.toLowerCase().includes(query) ||
          nft.collectionName?.toLowerCase().includes(query) ||
          nft.attributes?.some(attr => 
            attr.trait_type.toLowerCase().includes(query) || 
            attr.value.toLowerCase().includes(query)
          )
        );
      });
      setFilteredNFTs(filtered);
    }
    
    // Reset to page 1 when searching
    setCurrentPage(1);
  };
  
  // Apply sorting to loaded NFTs when sorted state changes
  useEffect(() => {
    if (sorted && loadedNFTs.length > 0) {
      setLoadedNFTs(enhancedSortNFTsByCreationDate(loadedNFTs));
      setFilteredNFTs(searchQuery ? 
        filteredNFTs.length ? enhancedSortNFTsByCreationDate(filteredNFTs) : [] 
        : enhancedSortNFTsByCreationDate(loadedNFTs)
      );
    }
  }, [sorted]);
  
  // Handle sort button click
  const handleSortByDate = () => {
    setSorted(true);
    
    // Apply sorting to both loaded and filtered NFTs
    const sortedNFTs = enhancedSortNFTsByCreationDate(loadedNFTs);
    setLoadedNFTs(sortedNFTs);
    
    // Apply sorting to filtered NFTs if a search is active
    if (searchQuery) {
      setFilteredNFTs(enhancedSortNFTsByCreationDate(filteredNFTs));
    } else {
      setFilteredNFTs(sortedNFTs);
    }
  };
  
  // Fetch all NFTs with optimized loading and sorting
  const fetchAllNFTs = async () => {
    setIsLoadingNFTs(true);
    setLoadingMessage('Fetching NFTs...');
    setLoadedNFTs([]);
    setFilteredNFTs([]);
    setSorted(false);
    
    try {
      // Fetch display names first
      await syncDisplayNamesFromSheets();
      
      // Initialize collections to fetch
      const collections = await getUltimateAndRegularCollections();
      if (!collections || collections.length === 0) {
        throw new Error('No collections found');
      }
      
      // Track all fetched NFTs
      let accumulatedNFTs: NFT[] = [];
      
      // First, fetch Ultimate and Physical collections
      for (const coll of collections.filter(c => 
        c.ultimates || c.type === 'ultimate' || 
        c.name.includes('Ultimate') || c.name.includes('Physical')
      )) {
        try {
          console.log(`Fetching collection ${coll.name}...`);
          const collectionNFTs = await fetchNFTsByCollection(coll.name);
          if (collectionNFTs?.length) {
            // Add to accumulated NFTs with sorting if enabled
            accumulatedNFTs = processBatchWithSorting(accumulatedNFTs, collectionNFTs, sorted);
            
            // Update UI with the current batch
            setLoadedNFTs(accumulatedNFTs);
            setFilteredNFTs(accumulatedNFTs);
            setLoadingMessage(`Loaded ${accumulatedNFTs.length} NFTs...`);
            
            // Preload images for this batch
            await preloadImages(collectionNFTs);
          }
        } catch (e) {
          console.error(`Error fetching collection ${coll.name}:`, e);
        }
      }
      
      // Then fetch regular collections
      for (const coll of collections.filter(c => 
        !c.ultimates && c.type !== 'ultimate' && 
        !c.name.includes('Ultimate') && !c.name.includes('Physical')
      )) {
        try {
          console.log(`Fetching collection ${coll.name}...`);
          const collectionNFTs = await fetchNFTsByCollection(coll.name);
          if (collectionNFTs?.length) {
            // Add to accumulated NFTs with sorting if enabled
            accumulatedNFTs = processBatchWithSorting(accumulatedNFTs, collectionNFTs, sorted);
            
            // Update UI with the current batch
            setLoadedNFTs(accumulatedNFTs);
            setFilteredNFTs(accumulatedNFTs);
            setLoadingMessage(`Loaded ${accumulatedNFTs.length} NFTs...`);
            
            // Preload images for this batch
            await preloadImages(collectionNFTs);
          }
        } catch (e) {
          console.error(`Error fetching collection ${coll.name}:`, e);
        }
      }
      
      console.log('All NFTs loaded:', accumulatedNFTs.length);
      
      // Final update with all NFTs
      setLoadedNFTs(accumulatedNFTs);
      setFilteredNFTs(accumulatedNFTs);
      setIsLoadingNFTs(false);
      setLoadingMessage('');
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      setIsLoadingNFTs(false);
      setLoadingMessage('Error loading NFTs.');
    }
  };
  
  // Optimize image preloading
  const preloadImages = async (nfts: NFT[]) => {
    // Don't preload if the global cache is not available
    if (typeof window === 'undefined' || !window.nftImageCache) {
      return;
    }
    
    const batchSize = 5; // Load 5 images at a time
    const delayBetweenBatches = 100; // 100ms delay between batches
    
    // Create batches of NFTs for preloading
    for (let i = 0; i < nfts.length; i += batchSize) {
      const batch = nfts.slice(i, i + batchSize);
      
      // Skip NFTs without images or already cached images
      const imagesToPreload = batch
        .filter(nft => nft.image && !window.nftImageCache.has(nft.image));
      
      // Preload images in this batch concurrently
      await Promise.all(
        imagesToPreload.map(nft => {
          return new Promise<void>((resolve) => {
            if (!nft.image) {
              resolve();
              return;
            }
            
            // Mark this image as being processed in the cache
            window.nftImageCache.set(nft.image, false);
            
            const img = new Image();
            
            img.onload = () => {
              window.nftImageCache.set(nft.image, true);
              resolve();
            };
            
            img.onerror = () => {
              window.nftImageCache.set(nft.image, false);
              resolve();
            };
            
            // Start loading
            img.src = nft.image;
          });
        })
      );
      
      // Add a small delay between batches to prevent overwhelming the browser
      if (i + batchSize < nfts.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  };
  
  // Load NFTs when component mounts
  useEffect(() => {
    fetchAllNFTs();
  }, []);
  
  return (
    <div className="poet-app">
      <MainContainer maxWidth="xl">
        <Typography variant="h3" sx={{ textAlign: 'center', mb: 4, fontFamily: 'Arial, sans-serif', fontWeight: 'bold' }}>
          NFT Market
        </Typography>
        
        {/* Controls Section */}
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          {/* Search Field */}
          <TextField
            placeholder="Search NFTs..."
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={handleSearchChange}
            sx={{ mb: isMobile ? 2 : 0, width: isMobile ? '100%' : '300px' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          {/* Buttons */}
          <Box sx={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
            <Button 
              variant="contained" 
              onClick={fetchAllNFTs}
              sx={{ 
                mr: 1,
                backgroundColor: '#663399',
                '&:hover': { backgroundColor: '#42297a' }
              }}
              startIcon={<RefreshIcon />}
            >
              Refresh NFTs
            </Button>
            
            <Button
              variant="contained"
              onClick={handleSortByDate}
              sx={{
                backgroundColor: sorted ? '#4a7c59' : '#7c4a59',
                '&:hover': { backgroundColor: sorted ? '#3a6249' : '#6c3a49' }
              }}
              startIcon={<SortIcon />}
            >
              Sort by Date
            </Button>
          </Box>
        </Box>
        
        {/* Loading Indicator */}
        {isLoadingNFTs && (
          <LoadingContainer>
            <CircularProgress color="secondary" size={40} thickness={4} />
            <Typography variant="body1" sx={{ mt: 2 }}>
              {loadingMessage || 'Loading NFTs...'}
            </Typography>
          </LoadingContainer>
        )}
        
        {/* No Results */}
        {!isLoadingNFTs && filteredNFTs.length === 0 && (
          <Typography variant="h6" sx={{ textAlign: 'center', my: 4 }}>
            No NFTs found. Try adjusting your search or refresh to load NFTs.
          </Typography>
        )}
        
        {/* NFT Grid */}
        <StyledGrid container spacing={isMobile ? 1 : 2}>
          {currentNFTs.map((nft, index) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={`${nft.mint}-${index}`}>
              <VintageCard 
                nft={nft} 
                wallet={publicKey ? { publicKey } : null} 
                connected={connected}
              />
            </Grid>
          ))}
        </StyledGrid>
        
        {/* Pagination */}
        {filteredNFTs.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <Pagination 
              count={totalPages} 
              page={currentPage} 
              onChange={handlePageChange} 
              color="primary" 
              size={isMobile ? "small" : "medium"}
            />
          </Box>
        )}
      </MainContainer>
    </div>
  );
};

export default Market; 