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
    console.log(`Fetching NFT data for address: ${nftAddress}`);
    const response = await axios.get(`/api/nft/helius/${nftAddress}`);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch NFT data');
    }
    const nftData = response.data.nft;

    // Find collection name and image if this is an ultimate NFT
    let collectionName = '';
    let collectionAddress = '';
    let imageUrl = nftData.image || '';
    
    if (ultimate?.collection_id) {
      const collection = collections.find(c => c.address === ultimate.collection_id);
      if (collection) {
        collectionName = collection.name;
        collectionAddress = collection.address;
        // For ultimates, use the NFT's image directly
        imageUrl = nftData.image || '';
      }
    }

    // Ensure we have all required data
    return {
      ...nftData,
      mint: nftAddress,
      name: nftData.name || (ultimate?.name || 'Unknown NFT'),
      description: nftData.description || '',
      image: imageUrl,
      attributes: nftData.attributes || [],
      owner: typeof nftData.owner === 'string' 
        ? { publicKey: nftData.owner }
        : {
            publicKey: nftData.owner.publicKey || '',
            delegate: nftData.owner.delegate || null,
            ownershipModel: nftData.owner.ownershipModel || 'single',
            frozen: nftData.owner.frozen || false,
            delegated: nftData.owner.delegated || false,
          },
      listed: false,
      collectionName: collectionName || nftData.collection?.name || '',
      collectionAddress: collectionAddress || nftData.collection?.address || '',
      creators: nftData.creators || [],
      royalty: nftData.royalty || null,
      tokenStandard: nftData.tokenStandard || null,
    };
  } catch (error) {
    console.error(`Failed to fetch NFT ${nftAddress}:`, error);
    if (retries > 0) {
      const delayTime = Math.pow(2, 3 - retries) * 1000; // Exponential backoff
      await delay(delayTime);
      return fetchNFTWithRetries(nftAddress, ultimate, collections, retries - 1);
    }
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
const validateCollection = (collection: any): Collection | null => {
  // Check if collection has required fields
  if (!collection || !collection.address) return null;

  return {
    address: collection.address,
    name: collection.name || 'Unknown Collection',
    image: collection.image || '',
    description: collection.description || '',
    addedAt: collection.addedAt || Date.now(),
    creationDate: collection.creationDate || new Date().toISOString(),
    ultimates: collection.ultimates || false
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
      console.log('=== Starting NFT Loading Process ===');
      setLoading(true);
      setError(null);
      setLoadedNFTs([]);
      setIsLoadingMore(false);

      // Fetch display names first
      console.log('1. Fetching display names...');
      await fetchDisplayNames();

      // Fetch collections from Google Sheets with exponential backoff
      let retryCount = 0;
      let collectionsData = null;
      
      console.log('2. Fetching collections from API...');
      while (retryCount < 3) {
        try {
          collectionsData = await fetchCollectionsFromApi();
          console.log('Collections data received:', {
            success: !!collectionsData,
            length: Array.isArray(collectionsData) ? collectionsData.length : 0,
            sample: collectionsData?.[0]
          });
          break;
        } catch (err) {
          console.error('Error fetching collections, attempt', retryCount + 1, ':', err);
          retryCount++;
          if (retryCount < 3) {
            const delayTime = Math.min(2000 * Math.pow(2, retryCount), 8000);
            console.log(`Waiting ${delayTime}ms before retry...`);
            await delay(delayTime);
          }
        }
      }

      // Process collections
      console.log('3. Processing collections data...');
      const validCollections = (collectionsData || [])
        .map(collection => validateCollection(collection))
        .filter((c): c is Collection => c !== null);

      console.log('Valid collections processed:', {
        total: validCollections.length,
        collections: validCollections
      });

      setCollections(validCollections);

      // Fetch ultimate NFTs
      console.log('4. Fetching ultimate NFTs...');
      const ultimateNFTs = await getUltimateNFTs();
      console.log('Ultimates data received:', {
        success: !!ultimateNFTs,
        length: Array.isArray(ultimateNFTs) ? ultimateNFTs.length : 0,
        sample: ultimateNFTs?.[0]
      });

      // Filter out invalid NFT addresses
      const validNftAddresses = ultimateNFTs
        .filter(nft => nft && nft.nft_address && typeof nft.nft_address === 'string' && nft.nft_address.length > 0)
        .map(nft => nft.nft_address);

      console.log(`Found ${validNftAddresses.length} valid NFT addresses`);

      if (validNftAddresses.length === 0) {
        console.warn('No valid NFT addresses found in ultimates data');
        setLoading(false);
        return;
      }

      // Process NFTs in batches
      const batches = chunk(validNftAddresses, BATCH_SIZE);

      for (const [batchIndex, batch] of batches.entries()) {
        console.log(`Processing batch ${batchIndex + 1}/${batches.length}...`);
        
        const batchPromises = batch.map(async (nftAddress) => {
          const ultimate = ultimateNFTs.find(u => u.nft_address === nftAddress) || null;
          return fetchNFTWithRetries(nftAddress, ultimate, validCollections);
        });

        const batchResults = await Promise.all(batchPromises);
        const validNFTs = batchResults.filter((nft): nft is NFT => nft !== null);
        
        // Update state with new NFTs
        validNFTs.forEach(updateNFTs);

        if (batchIndex < batches.length - 1) {
          await delay(BATCH_DELAY);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error in fetchAllNFTs:', error);
      setError('Failed to load NFTs. Please try again later.');
      setLoading(false);
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