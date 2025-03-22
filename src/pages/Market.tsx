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
import { styled } from '@mui/material/styles';
import { useTheme, useMediaQuery } from '@mui/material';
import { WalletContextState } from '@solana/wallet-adapter-react';

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
    compression?: {
      created_at?: string;
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

// Add simple module-level caching
let cachedCollections: Collection[] | null = null;
let cachedCollectionsTimestamp = 0;
const COLLECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedUltimates: UltimateNFT[] | null = null; 
let cachedUltimatesTimestamp = 0;
const ULTIMATES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to fetch collections
const fetchCollections = async (): Promise<Collection[]> => {
  try {
    // Check if we have a valid cache
    const now = Date.now();
    if (cachedCollections && (now - cachedCollectionsTimestamp < COLLECTIONS_CACHE_TTL)) {
      console.log('Using cached collections:', cachedCollections.length);
      return cachedCollections;
    }
    
    console.log('Fetching collections from API...');
    
    // Add a timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await axios.get<CollectionApiResponse>(`/api/collection?t=${timestamp}`);
    
    console.log('Raw API response:', response.data);
    
    if (!response.data.success) {
      console.error('API request failed:', response.data);
      throw new Error('Failed to fetch collections');
    }
    
    // Get collections directly from the response
    const collections = response.data.collections || [];
    console.log('Collections from API (raw):', collections);
    
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
    
    // Update cache
    cachedCollections = collections;
    cachedCollectionsTimestamp = now;
    
    // Return the collections directly without additional validation
    // This ensures we're using exactly what the API returns
    return collections;
  } catch (error) {
    console.error('Error in fetchCollections:', error);
    throw error;
  }
};

// Helper function to fetch ultimate NFTs
const getUltimateNFTs = async (): Promise<UltimateNFT[]> => {
  try {
    // Check if we have a valid cache
    const now = Date.now();
    if (cachedUltimates && (now - cachedUltimatesTimestamp < ULTIMATES_CACHE_TTL)) {
      console.log('Using cached ultimates:', cachedUltimates.length);
      return cachedUltimates;
    }
    
    console.log('Fetching ultimates from API...');
    const response = await axios.get<UltimatesApiResponse>('/api/ultimates');
    
    if (!response.data.success) {
      throw new Error('Failed to fetch ultimate NFTs');
    }
    
    const ultimates = response.data.data || [];
    
    // Update cache
    cachedUltimates = ultimates;
    cachedUltimatesTimestamp = now;
    
    return ultimates;
  } catch (error) {
    console.error('Error fetching ultimate NFTs:', error);
    throw error;
  }
};

// Helper function to fetch collection NFTs
const fetchCollectionNFTs = async (collection: Collection): Promise<NFT[]> => {
  try {
    const nfts = await fetchCollectionNFTsWithRetry(collection, 1);
    return Promise.all(nfts.map(async nftData => {
      // Add defensive checks for missing data structures
      const ownership = nftData.ownership || {};
      
      // Get the creation date using the same logic as NFT Detail Modal
      let createdAt = null;
      let blockTime = null;
      
      try {
        // First try to get the asset from Helius API
        const assetResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getAsset',
            params: { id: nftData.id }
          })
        });

        if (assetResponse.ok) {
          const assetData = await assetResponse.json();
          const isCompressed = assetData.result?.compression?.compressed;

          if (isCompressed && assetData.result?.compression?.created_at) {
            createdAt = assetData.result.compression.created_at;
          }
        }

        // If no creation date found, get the mint transaction
        if (!createdAt) {
          const signaturesResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getSignaturesForAddress',
              params: [nftData.id, { limit: 1 }]
            })
          });

          if (signaturesResponse.ok) {
            const signaturesData = await signaturesResponse.json();
            if (signaturesData.result?.[0]?.blockTime) {
              blockTime = signaturesData.result[0].blockTime;
              createdAt = new Date(blockTime * 1000).toISOString();
            }
          }
        }

        // If still no date, try DAS API
        if (!createdAt) {
          const dasResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'searchAssets',
              params: {
                ownerAddress: ownership.owner,
                compressed: true,
                limit: 1000
              }
            })
          });

          if (dasResponse.ok) {
            const dasData = await dasResponse.json();
            const matchingAsset = dasData.result?.items?.find((asset: any) => 
              asset.id === nftData.id || 
              asset.content?.metadata?.name === (nftData.content?.metadata?.name || nftData.content?.json?.name)
            );

            if (matchingAsset?.content?.metadata?.created_at) {
              createdAt = matchingAsset.content.metadata.created_at;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching creation date:', error);
      }

      // Use fallbacks if no creation date found
      if (!createdAt) {
        createdAt = nftData.content?.metadata?.created_at || 
                   nftData.compression?.created_at || 
                   nftData.content?.metadata?.attributes?.find((attr: any) => 
                     attr.trait_type === 'created' || 
                     attr.trait_type === 'Creation Date'
                   )?.value ||
                   collection.creationDate || 
                   collection.firstNftDate || 
                   new Date().toISOString();
      }

      // Store the blockTime separately for sorting
      const finalCreatedAt = blockTime ? blockTime * 1000 : new Date(createdAt).getTime();

      return {
        mint: nftData.id,
        name: nftData.content?.metadata?.name || nftData.content?.json?.name || 'Unknown NFT',
        description: nftData.content?.metadata?.description || nftData.content?.json?.description || '',
        image: nftData.content?.files?.[0]?.uri || nftData.content?.links?.image || nftData.content?.metadata?.image || nftData.content?.json?.image || '',
        attributes: nftData.content?.metadata?.attributes || nftData.content?.json?.attributes || [],
        owner: {
          publicKey: ownership.owner || '',
          ownershipModel: ownership.ownershipModel || 'single',
          delegated: ownership.delegated || false,
          delegate: ownership.delegate || null,
          frozen: ownership.frozen || false,
        },
        listed: false,
        collectionName: collection.name,
        collectionAddress: collection.address,
        creators: nftData.creators || [],
        royalty: nftData.royalty || null,
        tokenStandard: nftData.tokenStandard || null,
        content: nftData.content,
        compression: nftData.compression,
        createdAt: finalCreatedAt.toString() // Store as timestamp string for consistent sorting
      };
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
    let collectionInfo: Collection | undefined;
    
    if (ultimate?.collection_id) {
      collectionInfo = collections.find(c => c.address === ultimate.collection_id);
      if (collectionInfo) {
        collectionName = collectionInfo.name;
        collectionAddress = collectionInfo.address;
        // For ultimates, use the NFT's image directly
        imageUrl = nftData.image || '';
      }
    }

    // Default owner object to ensure we always have required fields
    const ownerObj = typeof nftData.owner === 'string' 
      ? { publicKey: nftData.owner || '' }
      : {
          publicKey: nftData.owner?.publicKey || '',
          delegate: nftData.owner?.delegate || null,
          ownershipModel: nftData.owner?.ownershipModel || 'single',
          frozen: nftData.owner?.frozen || false,
          delegated: nftData.owner?.delegated || false,
        };

    // Ensure we have all required data
    return {
      ...nftData,
      mint: nftAddress,
      name: nftData.name || (ultimate?.Name || 'Unknown NFT'),
      description: nftData.description || '',
      image: imageUrl,
      attributes: nftData.attributes || [],
      owner: ownerObj,
      listed: false,
      collectionName: collectionName || nftData.collection?.name || '',
      collectionAddress: collectionAddress || nftData.collection?.address || '',
      creators: nftData.creators || [],
      royalty: nftData.royalty || null,
      tokenStandard: nftData.tokenStandard || null,
      content: nftData.content,
      compression: nftData.compression,
      createdAt: nftData.content?.metadata?.created_at || 
                 nftData.compression?.created_at || 
                 nftData.content?.metadata?.attributes?.find((attr: any) => attr.trait_type === 'created' || attr.trait_type === 'Creation Date')?.value ||
                 collectionInfo?.creationDate || 
                 collectionInfo?.firstNftDate || 
                 new Date().toISOString(),
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
    collectionId: collection.collectionId || collection.address,
    firstNftDate: collection.firstNftDate || '',
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

// Add a styled component for the collection title
const CollectionTitle = styled(Typography)(({ theme }) => ({
  textAlign: 'center',
  fontSize: '1.5rem',
  fontWeight: 500,
  margin: '30px 0 15px 0',
  width: '100%',
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '60px',
    height: '2px',
    backgroundColor: theme.palette.primary.main,
  },
  [theme.breakpoints.down('sm')]: {
    fontSize: '1.25rem',
    margin: '20px 0 10px 0',
  }
}));

// Add helper function for parsing dates
const parseNFTDate = (dateStr: string | undefined): number => {
  if (!dateStr) return 0;
  
  try {
    // If it's already a timestamp string, parse it directly
    if (/^\d+$/.test(dateStr)) {
      return parseInt(dateStr);
    }
    
    // Try parsing as ISO string
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
    
    console.warn(`Could not parse date: ${dateStr}`);
    return 0;
  } catch (error) {
    console.error(`Error parsing date ${dateStr}:`, error);
    return 0;
  }
};

// Extend the NFT interface to support loading state
interface NFTWithLoadingState extends NFT {
  loading?: boolean;
  status?: string;
}

// Modified type for ultmates handling
interface NFTWithCollection extends Omit<NFTWithLoadingState, 'collection'> {
  collection: string; // This will temporarily hold the collection name during creation
}

const Market: React.FC = () => {
  const { publicKey, connected, wallet } = useWalletContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));
  
  // State for NFTs, collections, and UI
  const [nfts, setNFTs] = useState<NFTWithLoadingState[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<NFTWithLoadingState[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMyNFTs, setShowMyNFTs] = useState(false);
  const [loadedNFTs, setLoadedNFTs] = useState<NFTWithLoadingState[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [displayNamesLoaded, setDisplayNamesLoaded] = useState(false);
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());

  // Effect to uncheck "My NFTs" when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setShowMyNFTs(false);
    }
  }, [connected]);

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
    
    setNFTs(loadedNFTs.map(nft => {
      // Add defensive check to handle cases where nft.owner is undefined
      if (!nft.owner) {
        return {
          ...nft,
          ownerDisplayName: undefined
        };
      }
      
      const ownerAddress = typeof nft.owner === 'string' 
        ? nft.owner.toLowerCase()
        : (nft.owner.publicKey ? nft.owner.publicKey.toLowerCase() : '');
      
      return {
        ...nft,
        ownerDisplayName: ownerAddress ? displayNames.get(ownerAddress) : undefined
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

  // Update NFTs when collection changes
  const updateNFTs = useCallback((newNFT: NFT) => {
    setLoadedNFTs(prevNFTs => {
      const index = prevNFTs.findIndex(nft => nft.mint === newNFT.mint);
      if (index > -1) {
        const updatedNFTs = [...prevNFTs];
        updatedNFTs[index] = { ...newNFT };
        return updatedNFTs;
      }
      return [...prevNFTs, newNFT];
    });
    
    // Update UI with the new NFT immediately
    setNFTs(loadedNFTs.map(nft => {
      if (nft.mint === newNFT.mint) {
        return { ...newNFT };
      }
      return nft;
    }));
  }, [loadedNFTs]);

  // Reset NFTs when collection changes
  const resetNFTs = useCallback(() => {
    setLoadedNFTs([]);
    setNFTs([]);
    setFilteredNFTs([]);
  }, []);

  // Load more NFTs (for pagination)
  const loadMoreNFTs = useCallback(() => {
    if (isLoadingMore || !nfts.length) return;
    
    setIsLoadingMore(true);
    try {
      // Load next page of NFTs
      const nextPage = page + 1;
      setPage(nextPage);
      
      // Here you would typically fetch more NFTs from an API
      // For now, let's just show more from the loaded set
      
      setNFTs(loadedNFTs);
      setIsLoadingMore(false);
    } catch (error) {
      console.error('Error loading more NFTs:', error);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nfts.length, page, loadedNFTs]);

  const fetchAllNFTs = async () => {
    console.log('=== Starting NFT Loading Process ===');
    setLoading(true);
    setError(null);
    setLoadedNFTs([]);
    setIsLoadingMore(false);
    
    try {
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
      // Use the collections directly without additional validation
      const validCollections = collectionsData || [];

      console.log('Collections processed:', {
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

      // 1. Handle Ultimate NFTs
      console.log('4. Fetching ultimate NFTs...');
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
        
      // Pre-fetch the first 6 NFTs to display faster
      const initialNFTs: NFT[] = [];
      const firstSixAddresses = validUltimateAddresses.slice(0, 6);
      const firstSixPromises = firstSixAddresses.map(address => {
        const ultimate = ultimateNFTs.find(u => u["NFT Address"] === address);
        return fetchNFTWithRetries(address, ultimate || null, validCollections);
      });
      
      try {
        const results = await Promise.all(firstSixPromises);
        results.forEach(nft => {
          if (nft) {
            initialNFTs.push(nft);
            updateNFTs(nft);
          }
        });
      } catch (error) {
        console.error('Error pre-fetching initial NFTs:', error);
      }
        
      // 3. Process Ultimate NFTs - in small batches to avoid UI freezing
      console.log('5. Processing remaining ultimate NFTs...');
      // Skip the first 6 we already processed
      const remainingAddresses = validUltimateAddresses.slice(6);
      const batches = chunk(remainingAddresses, 5);
      
      // Show progress to the user for the rest of the NFTs
      let processedCount = firstSixAddresses.length;
      const totalCount = validUltimateAddresses.length;
      
      for (const [batchIndex, batch] of batches.entries()) {
        const batchPromises = batch.map(async (nftAddress) => {
          const ultimate = ultimateNFTs.find(u => u["NFT Address"] === nftAddress);
          return fetchNFTWithRetries(nftAddress, ultimate || null, validCollections);
        });

        try {
          const batchResults = await Promise.all(batchPromises);
          const validNFTs = batchResults.filter((nft): nft is NFT => nft !== null);
          
          processedCount += batch.length;
          console.log(`Batch ${batchIndex + 1}: Processed ${processedCount}/${totalCount} NFTs`);
          
          validNFTs.forEach(nft => updateNFTs(nft));

          // Add a small delay between batches to keep UI responsive
          if (batchIndex < batches.length - 1) {
            await delay(100);
          }
        } catch (batchError) {
          console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
        }
      }
      
      console.log('6. All NFTs processed successfully');
      
    } catch (error) {
      console.error('Error in fetchAllNFTs:', error);
      setError('Failed to load NFTs. Please try again later.');
    } finally {
      // Make sure loading stops even if there's an error
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllNFTs();
  }, []);

  // Update main NFTs state when loadedNFTs changes
  useEffect(() => {
    setNFTs(loadedNFTs);
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

  // Filter NFTs based on search term, collection, and ownership
  const filterNFTs = (nfts: NFT[], searchTerm: string, selectedCollection: string): NFT[] => {
    // Get all collection addresses for the selected collection name
    const collectionAddresses = selectedCollection 
      ? consolidatedCollections.find(c => c.name === selectedCollection)?.addresses || []
      : [];
      
    const searchLower = searchTerm.toLowerCase();
    
    return nfts.filter(nft => {
      const nftName = nft.name?.toLowerCase() || '';
      const collectionName = nft.collectionName?.toLowerCase() || '';
      
      // Check if the NFT matches the search term
      const matchesSearch = searchTerm === '' || 
        nftName.includes(searchLower) || 
        collectionName.includes(searchLower);
      
      // Check if the NFT matches the selected collection
      // If no collection is selected, all NFTs match
      // If a collection is selected, the NFT matches if:
      // 1. Its collectionAddress is in the list of addresses for the selected collection name
      // 2. Or its collectionName exactly matches the selected collection name
      const matchesCollection = selectedCollection === '' || 
        collectionAddresses.includes(nft.collectionAddress || '') ||
        nft.collectionName === selectedCollection;
      
      // Check if the NFT matches the ownership filter
      const matchesOwner = !showMyNFTs || (
        connected && 
        publicKey && 
        nft.owner && 
        (typeof nft.owner === 'string' 
          ? nft.owner === publicKey
          : (nft.owner.publicKey ? nft.owner.publicKey === publicKey : false))
      );
      
      return matchesSearch && matchesCollection && matchesOwner;
    });
  };

  // Group NFTs by collection name for display
  const groupedNFTsByCollection = useMemo(() => {
    // Filter the NFTs based on current filters
    const filtered = filterNFTs(nfts, searchTerm, selectedCollection);
    
    // If showing "My NFTs" or if a specific collection is selected, we don't need to group
    if (showMyNFTs || selectedCollection) {
      return [{ 
        collectionName: showMyNFTs ? 'My NFTs' : (selectedCollection || 'All NFTs'), 
        nfts: filtered.sort((a: NFT, b: NFT) => {
          // Sort by creation date (newest first)
          console.log(`Comparing NFTs:`, {
            a: {
              name: a.name,
              mint: a.mint,
              createdAt: a.createdAt,
              parsedDate: a.createdAt ? new Date(parseNFTDate(a.createdAt)) : null
            },
            b: {
              name: b.name,
              mint: b.mint,
              createdAt: b.createdAt,
              parsedDate: b.createdAt ? new Date(parseNFTDate(b.createdAt)) : null
            }
          });
          const dateA = parseNFTDate(a.createdAt);
          const dateB = parseNFTDate(b.createdAt);
          return dateB - dateA;
        })
      }];
    }
    
    // Group NFTs by collection name
    const groupedNFTs = filtered.reduce((acc, nft: NFT) => {
      const collectionName = nft.collectionName || 'Unknown Collection';
      
      if (!acc[collectionName]) {
        acc[collectionName] = [];
      }
      
      acc[collectionName].push(nft);
      return acc;
    }, {} as Record<string, NFT[]>);
    
    // Convert to array, sort collections alphabetically, and sort NFTs within each collection by date
    return Object.entries(groupedNFTs)
      .map(([collectionName, nfts]) => ({ 
        collectionName, 
        nfts: nfts.sort((a: NFT, b: NFT) => {
          // Sort by creation date (newest first)
          console.log(`Comparing NFTs in ${collectionName}:`, {
            a: {
              name: a.name,
              mint: a.mint,
              createdAt: a.createdAt,
              parsedDate: a.createdAt ? new Date(parseNFTDate(a.createdAt)) : null
            },
            b: {
              name: b.name,
              mint: b.mint,
              createdAt: b.createdAt,
              parsedDate: b.createdAt ? new Date(parseNFTDate(b.createdAt)) : null
            }
          });
          const dateA = parseNFTDate(a.createdAt);
          const dateB = parseNFTDate(b.createdAt);
          return dateB - dateA;
        })
      }))
      .sort((a, b) => a.collectionName.localeCompare(b.collectionName));
  }, [nfts, searchTerm, selectedCollection, showMyNFTs, filterNFTs]);
  
  // Get the current page's NFTs, possibly from multiple collections
  const currentPageGroupedNFTs = useMemo(() => {
    // If we have a specific collection or showing My NFTs, just paginate the single group
    if (showMyNFTs || selectedCollection) {
      const group = groupedNFTsByCollection[0];
      return [{
        collectionName: group.collectionName,
        nfts: group.nfts.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
      }];
    }
    
    // We need to paginate across all collections
    let nftsCount = 0;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = page * ITEMS_PER_PAGE;
    
    // Find which collections should be included on this page
    const result: { collectionName: string; nfts: NFT[] }[] = [];
    
    for (const group of groupedNFTsByCollection) {
      // Skip collections that end before our page starts
      if (nftsCount + group.nfts.length <= startIdx) {
        nftsCount += group.nfts.length;
        continue;
      }
      
      // If we've already filled the page, stop
      if (nftsCount >= endIdx) {
        break;
      }
      
      // Calculate which NFTs from this collection should be shown
      const collectionStartIdx = Math.max(0, startIdx - nftsCount);
      const collectionEndIdx = Math.min(group.nfts.length, endIdx - nftsCount);
      const collectionNFTs = group.nfts.slice(collectionStartIdx, collectionEndIdx);
      
      if (collectionNFTs.length > 0) {
        result.push({
          collectionName: group.collectionName,
          nfts: collectionNFTs
        });
      }
      
      nftsCount += group.nfts.length;
    }
    
    return result;
  }, [groupedNFTsByCollection, page, showMyNFTs, selectedCollection]);
  
  // Calculate total filtered NFTs for pagination
  const totalFilteredNFTs = useMemo(() => {
    return groupedNFTsByCollection.reduce((acc, group) => acc + group.nfts.length, 0);
  }, [groupedNFTsByCollection]);
  
  // Update page count based on total filtered NFTs
  const pageCount = Math.ceil(totalFilteredNFTs / ITEMS_PER_PAGE);

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo(0, 0);
  };

  return (
    <Container 
      maxWidth={false}
      sx={{
        px: { xs: '0px', sm: 1, md: 1 }, // Reduce padding further
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}
    >
      <Box sx={{ 
        py: { xs: 2, sm: 4 },
        px: { xs: 0, sm: 0 }, // Remove horizontal padding completely
        width: { xs: '100%', sm: '98%' }, // Full width on mobile, slightly constrained on desktop
        maxWidth: { xs: '100%', sm: '98%' }, // Full width on mobile, slightly constrained on desktop
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <Grid 
          container 
          spacing={{ xs: 2, sm: 3 }} // Less spacing on mobile
          sx={{ width: '100%', m: 0 }} // Full width, no margin
        >
          <Grid item xs={12} sx={{ 
            px: 0,
            width: '100%', 
            maxWidth: '100%',
            mx: 'auto'
          }}> 
            {/* Search and filter UI - stack vertically on mobile */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', sm: 'row' },
                gap: { xs: 1, sm: 2 }, // Smaller gap on mobile
                mb: { xs: 2, sm: 3 }, // Less margin on mobile
                width: '100%', // Full width
                maxWidth: '100%'
              }}
            >
              {/* First row on mobile: Search bar and My NFT checkbox */}
              <Box 
                sx={{ 
                  display: 'flex', 
                  gap: {xs: 1, sm: 2}, // Reduce gap on mobile
                  width: '100%',
                  alignItems: 'center'
                }}
              >
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
                  sx={{ 
                    flex: {xs: 3, sm: 1}, // Make search bar take more space on mobile
                    '& .MuiInputBase-root': {
                      paddingRight: { xs: '8px', sm: '14px' } // Less padding on mobile
                    }
                  }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showMyNFTs}
                      onChange={(e) => setShowMyNFTs(e.target.checked)}
                      disabled={!connected}
                      size="small" // Slightly smaller checkbox on mobile
                    />
                  }
                  label="My NFTs"
                  sx={{ 
                    minWidth: {xs: 90, sm: 100}, // Slightly narrower on desktop too
                    opacity: connected ? 1 : 0.5,
                    cursor: connected ? 'pointer' : 'not-allowed',
                    ml: {xs: 'auto', sm: 0}, // Auto margin on mobile pushes to right
                    '& .MuiFormControlLabel-label': {
                      fontSize: {xs: '0.85rem', sm: '1rem'}, // Smaller text on mobile
                    }
                  }}
                />
              </Box>
              
              {/* Second row on mobile: Collections dropdown */}
              <FormControl sx={{ 
                width: '100%', 
                mt: { xs: 0, sm: 1 },
                maxWidth: { sm: '100%', md: '100%' } // Ensure dropdown takes full width of its container
              }}>
                <InputLabel>Collection</InputLabel>
                <Select
                  value={selectedCollection}
                  label="Collection"
                  onChange={(e) => {
                    const selected = e.target.value;
                    console.log(`Collection selected: "${selected}"`);
                    
                    if (selected) {
                      const selectedCollectionInfo = consolidatedCollections.find(c => c.name === selected);
                      console.log('Selected collection addresses:', selectedCollectionInfo?.addresses);
                      
                      // Count how many NFTs match this collection
                      const matchingNFTs = nfts.filter(nft => 
                        selectedCollectionInfo?.addresses.includes(nft.collectionAddress || '') || 
                        nft.collectionName === selected
                      );
                      console.log(`Found ${matchingNFTs.length} NFTs matching collection "${selected}"`);
                    }
                    
                    setSelectedCollection(selected);
                    setPage(1); // Reset to first page when changing collection
                  }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300
                      },
                    },
                  }}
                  sx={{
                    '& .MuiInputBase-root': {
                      paddingRight: { xs: '8px', sm: '14px' } // Less padding on mobile
                    }
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
              {/* Replace the existing NFT grid with grouped collection sections */}
              {currentPageGroupedNFTs.map((group) => (
                <React.Fragment key={group.collectionName}>
                  {/* Collection Title */}
                  <CollectionTitle variant="h4">
                    {group.collectionName}
                  </CollectionTitle>
                  
                  {/* NFTs Grid */}
                  <Grid 
                    container 
                    spacing={{ xs: 2, sm: 1, md: 1 }}
                    sx={{ 
                      px: 0,
                      mx: 'auto',
                      justifyContent: 'center',
                      width: '100%',
                      maxWidth: '100%',
                      alignItems: 'center'
                    }}
                  >
                    {group.nfts.map((nft) => (
                      <Grid 
                        item 
                        key={nft.mint} 
                        xs={12} 
                        sm={6} 
                        md={4} 
                        lg={3}
                        sx={{
                          px: { xs: 0, sm: '2px' },  // No padding on mobile
                          py: { xs: 1, sm: 1 },
                          display: 'flex',
                          justifyContent: { xs: 'flex-start', sm: 'center' }, // Left align on mobile to offset the card's right shift
                          alignItems: 'center',
                          textAlign: 'center',
                          pl: { xs: '10px', sm: 0 }, // Increased left padding from 6px to 10px on mobile only
                        }}
                      >
                        <VintageCard
                          key={nft.mint}
                          nft={nft}
                          wallet={{ publicKey }}
                          connected={connected}
                          displayName={nft.owner ? displayNames.get(typeof nft.owner === 'string' ? nft.owner : nft.owner.publicKey) : undefined}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </React.Fragment>
              ))}
              
              {/* Loading indicator */}
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
              
              {/* Pagination */}
              {pageCount > 1 && (
                <Box sx={{ mt: 4, mb: 2, display: 'flex', justifyContent: 'center' }}>
                  <Pagination 
                    count={pageCount} 
                    page={page} 
                    onChange={handlePageChange}
                    variant="outlined"
                    shape="rounded"
                    size={isMobile ? "small" : "medium"}
                    sx={{
                      '& .MuiPaginationItem-root': {
                        bgcolor: 'background.paper',
                      }
                    }}
                  />
                </Box>
              )}
            </>
          )}
        </Grid>
      </Box>
    </Container>
  );
};

export default Market; 