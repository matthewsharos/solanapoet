import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Typography, 
  Box, 
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Container,
  IconButton,
  Pagination,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import axios from 'axios';
import type { NFT } from '../types/nft';
import VintageCard from '../components/VintageCard';
import { getCollections } from '../api/storage';
import { fetchCollections as fetchCollectionsFromApi, getUltimateNFTs, UltimateNFT, Collection } from '../api/collections';
import { useWalletContext } from '../contexts/WalletContext';
import { fetchCollectionNFTs, NFTMetadata } from '../utils/nftUtils';
import { API_BASE_URL } from '../api/config';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';

// Helper function to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Optimize batch size for better performance while staying under rate limits
const BATCH_SIZE = 10; // Increased from 5 to 10
const BATCH_DELAY = 500; // Reduced from 1000ms to 500ms for faster processing

// Helper function to chunk array into smaller arrays
const chunk = <T,>(arr: T[], size: number): T[][] => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
};

// Helper function to fetch NFT data with retries and rate limiting
const fetchNFTWithRetries = async (nftAddress: string, ultimate: UltimateNFT | null = null, collections: Collection[], retries = 3): Promise<NFT | null> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/nft/helius/${nftAddress}`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch NFT data');
    }
    const nftData = response.data.nft;

    // Find collection name if this is an ultimate NFT
    let collectionName = '';
    let collectionAddress = '';
    if (ultimate?.collection_id) {
      const collection = collections.find(c => c.address === ultimate.collection_id);
      if (collection) {
        collectionName = collection.name;
        collectionAddress = collection.address;
      }
    }

    return {
      ...nftData,
      mint: nftAddress,
      name: nftData.name || (ultimate?.name || 'Unknown NFT'),
      image: nftData.imageUrl || nftData.image || '',
      owner: typeof nftData.owner === 'string' 
        ? { publicKey: nftData.owner }
        : nftData.owner,
      listed: false,
      collectionName: collectionName,
      collectionAddress: collectionAddress
    };
  } catch (error: any) {
    // Handle server response with retry information
    const status = error.response?.status;
    const responseData = error.response?.data;
    
    if (retries > 0 && responseData?.shouldRetry) {
      const retryDelay = responseData.retryAfter || Math.min(2000 * Math.pow(2, 3 - retries), 8000);
      console.log(`Retrying fetch for NFT ${nftAddress}, ${retries} attempts remaining. Waiting ${retryDelay}ms...`);
      await delay(retryDelay);
      return fetchNFTWithRetries(nftAddress, ultimate, collections, retries - 1);
    }

    // If we're out of retries but have ultimate data, return a minimal NFT object
    if (ultimate) {
      console.warn(`Failed to fetch NFT ${nftAddress} after retries, using fallback data`);
      // Find collection name for fallback data
      let collectionName = '';
      let collectionAddress = '';
      if (ultimate.collection_id) {
        const collection = collections.find(c => c.address === ultimate.collection_id);
        if (collection) {
          collectionName = collection.name;
          collectionAddress = collection.address;
        }
      }
      
      return {
        mint: nftAddress,
        name: ultimate.name || 'Unknown NFT',
        image: '',
        owner: { publicKey: ultimate.owner },
        listed: false,
        collectionName: collectionName,
        collectionAddress: collectionAddress
      } as NFT;
    }

    console.error('Failed to fetch NFT after retries:', error);
    return null;
  }
};

interface UltimateNFTData {
  nft_address: string;
  name: string;
  owner: string;
  collection_id: string;
}

interface DisplayNameMapping {
  walletAddress: string;
  displayName: string;
}

const ITEMS_PER_PAGE = 40;

// Helper function to validate collection data
const validateCollection = (collection: string[]): Collection | null => {
  if (!collection || !collection[0]) return null;

  return {
    address: collection[0],
    name: collection[1] || 'Unknown Collection',
    image: collection[2] || '',
    description: collection[3] || '',
    addedAt: Number(collection[4]) || Date.now(),
    creationDate: collection[5] || new Date().toISOString(),
    ultimates: collection[6]?.toLowerCase() === 'true'
  };
};

const Market: React.FC = () => {
  const { wallet, connected } = useWalletContext();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());
  const [displayNamesLoaded, setDisplayNamesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMyNFTs, setShowMyNFTs] = useState(false);

  // Add state for progressive loading
  const [loadedNFTs, setLoadedNFTs] = useState<NFT[]>([]);
  const [page, setPage] = useState(1);

  const fetchDisplayNames = async () => {
    // If display names are already loaded, don't fetch again
    if (displayNamesLoaded) return;
    
    try {
      console.log('Fetching display names...');
      // Force a sync with Google Sheets first
      await syncDisplayNamesFromSheets();
      
      // Get all display names from localStorage
      const storedNames = localStorage.getItem('wallet_display_names');
      const parsedNames = JSON.parse(storedNames || '{}') as Record<string, string>;
      const namesMap = new Map<string, string>(Object.entries(parsedNames));
      setDisplayNames(namesMap);
      setDisplayNamesLoaded(true);
      console.log('Display names loaded:', namesMap);
    } catch (err) {
      console.error('Error fetching display names:', err);
    }
  };

  // Update NFTs when display names change
  useEffect(() => {
    if (!displayNamesLoaded) return;
    
    setNfts(loadedNFTs.map(nft => {
      const ownerAddress = typeof nft.owner === 'string' 
        ? nft.owner.toLowerCase()
        : nft.owner.publicKey.toLowerCase();
      
      return {
        ...nft,
        ownerDisplayName: displayNames.get(ownerAddress)
      };
    }));
  }, [loadedNFTs, displayNames, displayNamesLoaded]);

  // Listen for display name updates
  useEffect(() => {
    const handleDisplayNameUpdate = (event: CustomEvent<{ displayNames: Record<string, string> }>) => {
      const updatedNames = event.detail?.displayNames;
      if (updatedNames) {
        const entries = Object.entries(updatedNames) as [string, string][];
        setDisplayNames(new Map(entries));
      }
    };

    window.addEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);
    return () => {
      window.removeEventListener('displayNamesUpdated', handleDisplayNameUpdate as EventListener);
    };
  }, []);

  // Fetch display names when NFTs are loaded
  useEffect(() => {
    if (loadedNFTs.length > 0 && !displayNamesLoaded) {
      fetchDisplayNames();
    }
  }, [loadedNFTs, displayNamesLoaded]);

  const updateNFTs = useCallback((newNFT: NFT) => {
    setLoadedNFTs(prev => {
      // Check if NFT already exists to avoid duplicates
      if (prev.some(n => n.mint === newNFT.mint)) {
        return prev;
      }

      return [...prev, newNFT];
    });
  }, []);

  const fetchAllNFTs = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadedNFTs([]);
      setIsLoadingMore(false);

      console.log('Starting fetchAllNFTs...');

      // Fetch display names first
      await fetchDisplayNames();

      // Fetch collections from Google Sheets with exponential backoff
      let retryCount = 0;
      let collectionsData = null;
      
      console.log('Fetching collections from API...');
      while (retryCount < 3) {
        try {
          collectionsData = await fetchCollectionsFromApi();
          console.log('Collections data received:', collectionsData);
          break;
        } catch (err) {
          console.error('Error fetching collections, attempt', retryCount + 1, ':', err);
          retryCount++;
          if (retryCount < 3) {
            await delay(Math.min(2000 * Math.pow(2, retryCount), 8000));
          }
        }
      }

      if (!collectionsData) {
        console.error('Failed to fetch collections after multiple retries');
        setError('Failed to fetch collections after multiple retries');
        setLoading(false);
        return;
      }

      // Filter out invalid collections and transform array data
      const validCollections = (collectionsData as unknown as string[][])
        .slice(1)
        .map(validateCollection)
        .filter((collection): collection is Collection => collection !== null);
      
      console.log('Valid collections:', validCollections);
      setCollections(validCollections);
      setIsLoadingMore(true);
      
      // Get all ultimate NFTs with retry logic
      retryCount = 0;
      let ultimates = null;
      
      console.log('Fetching ultimate NFTs...');
      while (retryCount < 3) {
        try {
          ultimates = (await getUltimateNFTs() as unknown) as string[][];
          console.log('Ultimates data received:', ultimates);
          break;
        } catch (err) {
          console.error('Error fetching ultimates, attempt', retryCount + 1, ':', err);
          retryCount++;
          if (retryCount < 3) {
            await delay(Math.pow(2, retryCount) * 1000);
          }
        }
      }

      if (!ultimates || !Array.isArray(ultimates)) {
        console.error('Failed to fetch ultimates or invalid data:', ultimates);
        setError('Failed to fetch ultimate NFTs');
        setLoading(false);
        return;
      }

      // Process ultimates in optimized batches with error tracking
      const ultimateChunks = chunk(ultimates.slice(1), BATCH_SIZE);
      const failedNFTs: string[] = [];
      
      for (const batch of ultimateChunks) {
        const results = await Promise.allSettled(
          batch.map(async (ultimate: string[]) => {
            try {
              const ultimateNFT: UltimateNFTData = {
                nft_address: ultimate[0],
                name: ultimate[1],
                owner: ultimate[2],
                collection_id: ultimate[3]
              };
              
              if (!ultimateNFT.nft_address || ultimateNFT.nft_address === 'NFT Address') {
                return;
              }

              const nft = await fetchNFTWithRetries(ultimateNFT.nft_address, ultimateNFT, validCollections);
              if (nft) {
                updateNFTs(nft);
              } else {
                failedNFTs.push(ultimateNFT.nft_address);
              }
            } catch (err) {
              console.error('Error fetching ultimate NFT:', err);
              if (ultimate[0]) failedNFTs.push(ultimate[0]);
            }
          })
        );

        // Log failed NFTs for debugging
        const failedInBatch = results.filter(r => r.status === 'rejected').length;
        if (failedInBatch > 0) {
          console.warn(`Failed to fetch ${failedInBatch} NFTs in current batch`);
        }

        await delay(BATCH_DELAY);
      }
      
      // Process collections with optimized batches and error tracking
      for (const collection of validCollections) {
        if (!collection.address || collection.ultimates === true) {
          continue;
        }

        try {
          const collectionNFTs = await fetchCollectionNFTs(collection.address);
          const nftChunks = chunk(collectionNFTs, BATCH_SIZE);
          
          for (const batch of nftChunks) {
            const results = await Promise.allSettled(
              batch.map(async (nft: NFTMetadata) => {
                try {
                  if (!nft.mint) return;
                  
                  const nftData = await fetchNFTWithRetries(nft.mint, null, validCollections);
                  if (nftData) {
                    const enrichedNFT = {
                      ...nftData,
                      collectionName: collection.name,
                      collectionAddress: collection.address,
                      image: nft.image || nftData.image || '',
                      name: nft.name || nftData.name || 'Unknown NFT',
                      description: nft.description || nftData.description || ''
                    } as NFT;
                    
                    updateNFTs(enrichedNFT);
                  } else {
                    failedNFTs.push(nft.mint);
                  }
                } catch (err) {
                  console.error(`Error fetching NFT ${nft.mint}:`, err);
                  if (nft.mint) failedNFTs.push(nft.mint);
                }
              })
            );

            const failedInBatch = results.filter(r => r.status === 'rejected').length;
            if (failedInBatch > 0) {
              console.warn(`Failed to fetch ${failedInBatch} NFTs in collection ${collection.name} batch`);
            }

            await delay(BATCH_DELAY);
          }
        } catch (err) {
          console.error(`Error fetching NFTs for collection ${collection.name}:`, err);
        }
      }

      // Log summary of failed fetches
      if (failedNFTs.length > 0) {
        console.warn(`Total failed NFT fetches: ${failedNFTs.length}`);
      }

      setIsLoadingMore(false);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching NFTs:', err);
      setError('Failed to fetch NFTs. Please try again later.');
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchAllNFTs();
  }, []);

  // Update main NFTs state when loadedNFTs changes
  useEffect(() => {
    setNfts(loadedNFTs);
  }, [loadedNFTs]);

  // Add new function to consolidate collections by name
  const consolidatedCollections = useMemo(() => {
    const collectionMap = new Map<string, string[]>();
    
    collections.forEach(collection => {
      if (!collection.name) return; // Skip collections without names
      const existingAddresses = collectionMap.get(collection.name) || [];
      collectionMap.set(collection.name, [...existingAddresses, collection.address]);
    });

    return Array.from(collectionMap.entries())
      .map(([name, addresses]) => ({
        name,
        addresses
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [collections]);

  // Modify the filter function to handle multiple addresses and exact name matching
  const filterNFTs = (nfts: NFT[], searchTerm: string, selectedCollection: string): NFT[] => {
    return nfts.filter((nft: NFT) => {
      const matchesSearch = searchTerm === '' || 
        (nft.name && nft.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (nft.description && nft.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const collectionAddresses = consolidatedCollections.find(c => c.name === selectedCollection)?.addresses || [];
      const matchesCollection = selectedCollection === '' || 
        collectionAddresses.includes(nft.collectionAddress || '') ||
        nft.collectionName === selectedCollection; // Exact match with collection name
      
      const matchesOwner = !showMyNFTs || (
        connected && 
        wallet?.publicKey && 
        nft.owner && 
        (typeof nft.owner === 'string' 
          ? nft.owner === wallet.publicKey.toString()
          : nft.owner.publicKey === wallet.publicKey.toString())
      );
      
      return matchesSearch && matchesCollection && matchesOwner;
    });
  };

  // Get current NFTs for the page
  const filteredNFTs = filterNFTs(nfts, searchTerm, selectedCollection);
  const pageCount = Math.ceil(filteredNFTs.length / ITEMS_PER_PAGE);
  const currentNFTs = filteredNFTs.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo(0, 0);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
              <TextField
                label="Search NFTs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <IconButton>
                      <SearchIcon />
                    </IconButton>
                  ),
                }}
                sx={{ flex: 2 }} // Reduced width ratio
              />
              <FormControl sx={{ flex: 1.5 }}>
                <InputLabel>Collection</InputLabel>
                <Select
                  value={selectedCollection}
                  label="Collection"
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300
                      },
                    },
                  }}
                >
                  <MenuItem value="">All Collections</MenuItem>
                  {consolidatedCollections.map((collection) => (
                    <MenuItem 
                      key={collection.name} 
                      value={collection.name}
                    >
                      {collection.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showMyNFTs}
                    onChange={(e) => setShowMyNFTs(e.target.checked)}
                    disabled={!connected}
                  />
                }
                label="My NFTs"
                sx={{ 
                  minWidth: 120,
                  opacity: connected ? 1 : 0.5,
                  cursor: connected ? 'pointer' : 'not-allowed'
                }}
              />
            </Box>
          </Grid>

          {error ? (
            <Grid item xs={12}>
              <Typography color="error" align="center">
                {error}
              </Typography>
            </Grid>
          ) : (
            <>
              {/* Show NFTs as they load */}
              <Grid container spacing={3} sx={{ px: 3 }}>
                {currentNFTs.map((nft) => (
                  <Grid item key={nft.mint} xs={12} sm={6} md={4} lg={3}>
                    <VintageCard 
                      nft={nft} 
                      wallet={wallet} 
                      connected={connected}
                      displayName={
                        typeof nft.owner === 'string'
                          ? displayNames.get(nft.owner)
                          : displayNames.get(nft.owner.publicKey)
                      }
                    />
                  </Grid>
                ))}
              </Grid>
              
              {/* Show subtle loading indicator */}
              {(loading || isLoadingMore) && (
                <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: 1,
                    padding: '8px 16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <CircularProgress size={20} sx={{ color: 'primary.main' }} />
                    <Typography variant="body2" color="text.secondary">
                      Loading more NFTs...
                    </Typography>
                  </Box>
                </Grid>
              )}

              {pageCount > 1 && (
                <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <Pagination 
                    count={pageCount} 
                    page={page} 
                    onChange={handlePageChange}
                    color="primary"
                    size="large"
                    showFirstButton
                    showLastButton
                  />
                </Grid>
              )}
            </>
          )}
        </Grid>
      </Box>
    </Container>
  );
};

export default Market; 