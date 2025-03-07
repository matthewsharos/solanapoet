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
import type { NFT, NFTOwner, NFTAttribute } from '../types/nft';
import VintageCard from '../components/VintageCard';
import { useWalletContext } from '../contexts/WalletContext';
import { fetchCollectionNFTs as fetchCollectionNFTsFromUtils, NFTMetadata } from '../utils/nftUtils';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';

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
      };
      json?: {
        name?: string;
        description?: string;
        image?: string;
        attributes?: NFTAttribute[];
      };
      links?: {
        image?: string;
      };
    };
  };
}

interface CollectionAssetsApiResponse extends ApiResponse<never> {
  result: {
    items: Array<{
      id: string;
      content?: {
        metadata?: {
          name?: string;
          description?: string;
          image?: string;
          attributes?: NFTAttribute[];
        };
        json?: {
          name?: string;
          description?: string;
          image?: string;
          attributes?: NFTAttribute[];
        };
        files?: Array<{ uri: string; type: string }>;
        links?: {
          image?: string;
        };
      };
      ownership?: {
        owner: string;
        ownershipModel?: string;
        delegated?: boolean;
        delegate?: string | null;
        frozen?: boolean;
      };
      creators?: Array<{
        address: string;
        share: number;
        verified: boolean;
      }>;
      royalty?: number;
      tokenStandard?: string;
    }>;
    total: number;
  };
}

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

// Types for NFT data from Google Sheets
interface GoogleSheetsNFTData {
  "NFT Address": string;
  "Name": string;
  "Owner": string;
  "collection_id": string;
}

// Helper function to normalize NFT data
const normalizeNFTData = (nft: GoogleSheetsNFTData): UltimateNFT => ({
  "NFT Address": nft["NFT Address"],
  "Name": nft["Name"],
  "Owner": nft["Owner"],
  "collection_id": nft["collection_id"]
});

// Helper function to fetch collections
const fetchCollections = async (): Promise<Collection[]> => {
  try {
    console.log('Fetching collections from API...');
    
    // Add a timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await axios.get<CollectionApiResponse>(`/api/collection?t=${timestamp}`);
    
    console.log('Raw API response:', response.data);
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    if (!response.data.success) {
      console.error('API request failed:', response.data);
      throw new Error('Failed to fetch collections');
    }
    
    // Get collections directly from the response
    const collections = response.data.collections || [];
    console.log('Collections from API (raw):', collections);
    console.log('Collections type:', typeof collections);
    console.log('Is array:', Array.isArray(collections));
    
    if (!Array.isArray(collections)) {
      console.error('Collections is not an array:', collections);
      return [];
    }
    
    if (collections.length === 0) {
      console.warn('No collections received from API');
      return [];
    }
    
    // Log collection breakdown
    const ultimates = collections.filter((c: Collection) => c.ultimates).length;
    const regular = collections.filter((c: Collection) => !c.ultimates).length;
    console.log('Collections breakdown (raw):', { total: collections.length, ultimates, regular });
    
    // Validate each collection and log any issues
    const validatedCollections = collections.map((c: any, index: number) => {
      console.log(`Validating collection ${index}:`, c);
      const validated = validateCollection(c);
      if (!validated) {
        console.warn('Collection failed validation:', c);
      }
      return validated;
    }).filter(Boolean) as Collection[];
    
    console.log('Validated collections:', validatedCollections);
    console.log('Validated collections breakdown:', { 
      total: validatedCollections.length, 
      ultimates: validatedCollections.filter(c => c.ultimates).length, 
      regular: validatedCollections.filter(c => !c.ultimates).length 
    });
    
    return validatedCollections;
  } catch (error) {
    console.error('Error in fetchCollections:', error);
    throw error;
  }
};

// Helper function to fetch ultimate NFTs
const getUltimateNFTs = async (): Promise<UltimateNFT[]> => {
  const response = await axios.get<UltimatesApiResponse>('/api/ultimates');
  if (!response.data.success) {
    throw new Error('Failed to fetch ultimate NFTs');
  }
  return response.data.data || [];
};

// Helper function to fetch collection NFTs
const fetchCollectionNFTs = async (collection: Collection): Promise<NFT[]> => {
  try {
    const nfts = await fetchCollectionNFTsWithRetry(collection, 1);
    return nfts.map(nftData => ({
      mint: nftData.id,
      name: nftData.content?.metadata?.name || nftData.content?.json?.name || 'Unknown NFT',
      description: nftData.content?.metadata?.description || nftData.content?.json?.description || '',
      image: nftData.content?.files?.[0]?.uri || nftData.content?.links?.image || nftData.content?.metadata?.image || nftData.content?.json?.image || '',
      attributes: nftData.content?.metadata?.attributes || nftData.content?.json?.attributes || [],
      owner: {
        publicKey: nftData.ownership?.owner || '',
        ownershipModel: nftData.ownership?.ownershipModel || 'single',
        delegated: nftData.ownership?.delegated || false,
        delegate: nftData.ownership?.delegate || null,
        frozen: nftData.ownership?.frozen || false,
      },
      listed: false,
      collectionName: collection.name,
      collectionAddress: collection.address,
      creators: nftData.creators || [],
      royalty: nftData.royalty || null,
      tokenStandard: nftData.tokenStandard || null,
    }));
  } catch (error) {
    console.error(`Error fetching NFTs for collection ${collection.name}:`, error);
    return [];
  }
};

// Helper function to fetch NFT data with retries and rate limiting
const fetchNFTWithRetries = async (nftAddress: string, ultimate: UltimateNFT | null = null, collections: Collection[], retries = 3): Promise<NFT | null> => {
  try {
    console.log(`Fetching NFT data for address: ${nftAddress}`);
    const response = await axios.get<NFTApiResponse>(`/api/nft-helius/${nftAddress}`);
    
    if (!response.data.success) {
      console.error('Failed to fetch NFT data:', response.data);
      throw new Error(response.data.message || 'Failed to fetch NFT data');
    }
    const nftData = response.data.nft;
    console.log('Received NFT data:', nftData);

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
      name: nftData.name || (ultimate?.Name || 'Unknown NFT'),
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
      console.log(`Retrying fetch for ${nftAddress} in ${delayTime}ms (${retries} retries left)`);
      await delay(delayTime);
      return fetchNFTWithRetries(nftAddress, ultimate, collections, retries - 1);
    }
    return null;
  }
};

interface DisplayNameMapping {
  walletAddress: string;
  displayName: string;
}

const ITEMS_PER_PAGE = 40;

const fetchCollectionNFTsWithRetry = async (collection: Collection, page: number, maxRetries = 3) => {
  let lastError;
  let allItems: any[] = [];
  const pageSize = 1; // Helius API is working best with limit:1
  const totalPages = 100; // Fetch 100 NFTs max (increased from 10)
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1}/${maxRetries} - Fetching NFTs for collection ${collection.name} (${collection.address})`);
      
      // Fetch items one page at a time
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.log(`Fetching page ${currentPage}/${totalPages} for collection ${collection.name}`);
        
        const response = await axios.get<CollectionAssetsApiResponse>('/api/collection/assets', {
          params: {
            collectionId: collection.address,
            page: currentPage
          },
          timeout: 15000 // 15-second timeout
        });

        console.log(`Page ${currentPage} response:`, {
          status: response.status,
          hasData: !!response.data,
          hasResult: !!response.data?.result,
          items: response.data?.result?.items?.length || 0
        });

        if (!response.data?.result?.items) {
          console.warn(`Invalid response format on page ${currentPage}`);
          continue;
        }
        
        // Add items from this page
        allItems = [...allItems, ...response.data.result.items];
        
        // Check if we've reached the end
        if (response.data.result.items.length === 0 || 
            response.data.result.total <= currentPage * pageSize) {
          console.log(`Reached end of collection at page ${currentPage}`);
          break;
        }
      }
      
      console.log(`Retrieved ${allItems.length} total NFTs for collection ${collection.name}`);
      return allItems;
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed for collection ${collection.name}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        details: error.response?.data?.details,
        request: {
          url: '/api/collection/assets',
          payload: { collectionId: collection.address, page }
        }
      });

      // Fail fast on bad request
      if (error.response?.status === 400) {
        throw error;
      }

      // Fail fast on server error (500)
      if (error.response?.status === 500) {
        throw new Error('Server error, retries exhausted');
      }

      // Handle rate limiting
      if (error.response?.status === 429) {
        await delay(5000 * Math.pow(2, attempt));
        continue;
      }

      // Exponential backoff for other errors
      if (attempt < maxRetries - 1) {
        await delay(2000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Unknown error after retries');
};

// Helper function to validate collection objects
const validateCollection = (collection: any): Collection | null => {
  console.log('Validating collection input:', collection);
  
  if (!collection || typeof collection !== 'object') {
    console.log('Invalid collection (not an object):', collection);
    return null;
  }
  
  // Check if the collection has an address field
  if (!collection.address) {
    console.log('Invalid collection (missing address):', {
      collection
    });
    return null;
  }
  
  // Check if the collection has a name field
  if (!collection.name) {
    console.log('Invalid collection (missing name):', {
      collection
    });
    return null;
  }
  
  const result = {
    address: collection.address,
    name: collection.name,
    image: collection.image || '',
    description: collection.description || '',
    addedAt: collection.addedAt || Date.now(),
    creationDate: collection.creationDate || '',
    ultimates: collection.ultimates || false,
    collectionId: collection.collectionId || collection.address
  };
  
  console.log('Validated collection:', result);
  return result;
};

// Fix testFetch function to use a valid Collection object
const testFetch = async () => {
  try {
    const collection = { 
      name: 'Test Collection', 
      address: 'YOUR_TEST_ADDRESS',
      addedAt: Date.now(),
      description: '',
      creationDate: ''
    };
    const nfts = await fetchCollectionNFTsWithRetry(collection, 1);
    console.log('Fetched NFTs:', nfts);
  } catch (error) {
    console.error('Final error:', error);
  }
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
          collectionsData = await fetchCollections();
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

      // With our updated API, we should have both ultimates and regular collections
      const ultimateCollections = validCollections.filter(c => c.ultimates === true);
      const regularCollections = validCollections.filter(c => !c.ultimates);

      console.log('Collection breakdown:', {
        ultimate: ultimateCollections.length,
        regular: regularCollections.length,
        ultimateCollections,
        regularCollections
      });

      // Only fetch NFTs for regular collections, not ultimates
      console.log('4. Fetching NFTs for regular collections only...');

      // 1. Handle Ultimate NFTs
      console.log('5. Fetching ultimate NFTs...');
      const ultimateNFTs = await getUltimateNFTs();
      console.log('Ultimates data received:', {
        success: !!ultimateNFTs,
        length: Array.isArray(ultimateNFTs) ? ultimateNFTs.length : 0,
        sample: ultimateNFTs?.[0]
      });

      // Filter out invalid NFT addresses
      const validUltimateAddresses = ultimateNFTs
        .filter((nft): nft is UltimateNFT => {
          if (!nft || typeof nft !== 'object') return false;
          if (!nft["NFT Address"] || typeof nft["NFT Address"] !== 'string') return false;
          return nft["NFT Address"].trim().length > 0;
        })
        .map(nft => nft["NFT Address"].trim());

      // 2. Handle Regular Collection NFTs
      console.log('6. Fetching regular collection NFTs...');
      for (const collection of regularCollections) {
        try {
          console.log(`Fetching NFTs for collection: ${collection.name} (${collection.address})`);
          const collectionNFTs = await fetchCollectionNFTsWithRetry(collection, 1);
          
          if (collectionNFTs.length > 0) {
            console.log(`Found ${collectionNFTs.length} NFTs for collection ${collection.name}`);
            collectionNFTs.forEach(nft => updateNFTs(nft));
          } else {
            console.log(`No NFTs found for collection ${collection.name}`);
          }
        } catch (error) {
          console.error(`Error fetching NFTs for collection ${collection.name}:`, error);
        }
        
        // Add delay between collection requests to avoid rate limiting
        await delay(3000);
      }

      // 3. Process Ultimate NFTs
      console.log('7. Processing ultimate NFTs...');
      const ultimateBatches = chunk(validUltimateAddresses, BATCH_SIZE);

      for (const [batchIndex, batch] of ultimateBatches.entries()) {
        console.log(`Processing ultimate batch ${batchIndex + 1}/${ultimateBatches.length}`);
        
        const batchPromises = batch.map(async (nftAddress) => {
          const ultimate = ultimateNFTs.find(u => u["NFT Address"] === nftAddress);
          return fetchNFTWithRetries(nftAddress, ultimate || null, validCollections);
        });

        try {
          const batchResults = await Promise.all(batchPromises);
          const validNFTs = batchResults.filter((nft): nft is NFT => nft !== null);
          
          console.log(`Batch ${batchIndex + 1}: Found ${validNFTs.length} valid NFTs out of ${batch.length}`);
          validNFTs.forEach(nft => {
            console.log(`Adding ultimate NFT: ${nft.name} (${nft.mint})`);
            updateNFTs(nft);
          });

          if (batchIndex < ultimateBatches.length - 1) {
            await delay(BATCH_DELAY);
          }
        } catch (batchError) {
          console.error(`Error processing ultimate batch ${batchIndex + 1}:`, batchError);
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