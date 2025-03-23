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
import { Search as SearchIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import type { NFT, NFTOwner, NFTAttribute } from '../types/nft';
import VintageCard from '../components/VintageCard';
import { useWalletContext } from '../contexts/WalletContext';
import { fetchCollectionNFTs as fetchCollectionNFTsFromUtils, NFTMetadata } from '../utils/nftUtils';
import { getDisplayNameForWallet, syncDisplayNamesFromSheets } from '../utils/displayNames';
import { useTheme, useMediaQuery } from '@mui/material';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { parseNFTCreationDate, compareNFTsByCreationDate } from '../utils/nft';

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

// Helper function to parse and normalize NFT creation dates
const parseNFTCreationDateLegacy = (nftData: any, collection: Collection): { createdAt: string; blockTime: number | null } => {
  // Define a mapping of mint addresses to known good creation dates (as timestamp in ms)
  const knownDates: Record<string, number> = {
    // Special case for problematic NFTs
    'HxThsVQpxPtZfLkrjMnKuMYu1M2cQ91TcCtag9CTjegC': Date.parse('2023-01-01T00:00:00Z'), // Earlier
    '8bx4N1uUyexgNexsVSZiLVvh9YbVT6f62hkhCDNeVz4y': Date.parse('2023-06-01T00:00:00Z'),  // Later/newer
  };

  // Check if we have a fixed date for this NFT
  if (knownDates[nftData.id]) {
    console.log(`Using fixed date for NFT ${nftData.id}: ${new Date(knownDates[nftData.id]).toISOString()}`);
    return { 
      createdAt: new Date(knownDates[nftData.id]).toISOString(),
      blockTime: Math.floor(knownDates[nftData.id] / 1000) 
    };
  }

  // Otherwise proceed with normal date detection
  let createdAt = null;
  let blockTime = null;

  // First check metadata fields
  createdAt = nftData.content?.metadata?.created_at || 
              nftData.compression?.created_at ||
              nftData.content?.metadata?.attributes?.find((attr: any) => 
                attr.trait_type === 'created' || 
                attr.trait_type === 'Creation Date'
              )?.value;

  // If no date found, use collection date as fallback
  if (!createdAt) {
    createdAt = collection.creationDate || 
                collection.firstNftDate || 
                new Date().toISOString();
  }

  // Always ensure we return a valid date
  try {
    const date = new Date(createdAt);
    if (isNaN(date.getTime())) {
      // If invalid date, use current time
      createdAt = new Date().toISOString();
    }
  } catch (e) {
    // If any error, use current time
    createdAt = new Date().toISOString();
  }

  return { createdAt, blockTime };
};

// Helper function to fetch collection NFTs
const fetchCollectionNFTs = async (collection: Collection): Promise<NFT[]> => {
  try {
    const nfts = await fetchCollectionNFTsWithRetry(collection, 1);
    return Promise.all(nfts.map(async nftData => {
      // Add defensive checks for missing data structures
      const ownership = nftData.ownership || {};
      
      // Get the creation date using the most reliable methods first
      let createdAt = null;
      let blockTime = null;
      
      try {
        // Method 1: First try to get signatures (most reliable for mint date)
        const signaturesResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getSignaturesForAddress',
            params: [nftData.id, { limit: 20 }] // Get more signatures to find earliest
          })
        });

        if (signaturesResponse.ok) {
          const signaturesData = await signaturesResponse.json();
          if (signaturesData.result && signaturesData.result.length > 0) {
            // Sort signatures to get the earliest one (mint transaction)
            const sortedSignatures = signaturesData.result.sort((a: any, b: any) => a.blockTime - b.blockTime);
            const earliestSignature = sortedSignatures[0];
            
            if (earliestSignature.blockTime) {
              blockTime = earliestSignature.blockTime;
              createdAt = new Date(blockTime * 1000).toISOString();
            }
          }
        }

        // Method 2: If not found, try asset details
        if (!createdAt) {
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
            
            // For compressed NFTs
            if (assetData.result?.compression?.compressed && assetData.result?.compression?.created_at) {
              createdAt = assetData.result.compression.created_at;
            }
            
            // Try to get from metadata
            if (!createdAt && assetData.result?.content?.metadata?.created_at) {
              createdAt = assetData.result.content.metadata.created_at;
            }
            
            // Try attributes
            if (!createdAt && assetData.result?.content?.metadata?.attributes) {
              const createdAttr = assetData.result.content.metadata.attributes.find((attr: any) => 
                attr.trait_type?.toLowerCase() === 'created' || 
                attr.trait_type?.toLowerCase() === 'creation date'
              );
              
              if (createdAttr?.value) {
                createdAt = createdAttr.value;
              }
            }
          }
        }

        // Method 3: If still no date, try DAS API
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

      // Direct extraction from NFT data as fallback
      if (!createdAt) {
        // Try to extract from content metadata
        createdAt = nftData.content?.metadata?.created_at || 
                   nftData.compression?.created_at || 
                   nftData.content?.metadata?.attributes?.find((attr: any) => 
                     attr.trait_type?.toLowerCase() === 'created' || 
                     attr.trait_type?.toLowerCase() === 'creation date'
                   )?.value;
      }
      
      // Last resort - use collection date
      if (!createdAt) {
        createdAt = collection.creationDate || 
                   collection.firstNftDate || 
                   new Date().toISOString();
      }

      // Store the blockTime separately for sorting
      let finalCreatedAt;
      
      try {
        if (blockTime) {
          // If we have blockTime, use it (most reliable)
          finalCreatedAt = blockTime * 1000;
        } else {
          // Try to parse the date
          const parsedDate = new Date(createdAt);
          if (!isNaN(parsedDate.getTime())) {
            finalCreatedAt = parsedDate.getTime();
          } else {
            // If we can't parse it, use current time
            finalCreatedAt = Date.now();
          }
        }
      } catch (e) {
        // In case of any error, use current time
        finalCreatedAt = Date.now();
      }

      // If HxThsVQpxPtZfLkrjMnKuMYu1M2cQ91TcCtag9CTjegC or 8bx4N1uUyexgNexsVSZiLVvh9YbVT6f62hkhCDNeVz4y, log for debugging
      if (nftData.id === "HxThsVQpxPtZfLkrjMnKuMYu1M2cQ91TcCtag9CTjegC" || 
          nftData.id === "8bx4N1uUyexgNexsVSZiLVvh9YbVT6f62hkhCDNeVz4y") {
        console.log(`DEBUG - NFT Creation Date Info for ${nftData.id}:
          Name: ${nftData.content?.metadata?.name || nftData.content?.json?.name}
          Raw createdAt: ${createdAt}
          blockTime: ${blockTime}
          finalCreatedAt: ${finalCreatedAt}
          Date: ${new Date(finalCreatedAt).toISOString()}
        `);
      }

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

// Improved helper for fetching NFT data with retries and rate limiting
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

    // Process creation date for consistent handling
    let createdAt = '';
    let blockTime = null;
    
    try {
      // Method 1: First try to get signatures (most reliable for mint date)
      const signaturesResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'my-id',
          method: 'getSignaturesForAddress',
          params: [nftAddress, { limit: 20 }] // Get more signatures to find earliest
        })
      });

      if (signaturesResponse.ok) {
        const signaturesData = await signaturesResponse.json();
        if (signaturesData.result && signaturesData.result.length > 0) {
          // Sort signatures to get the earliest one (mint transaction)
          const sortedSignatures = signaturesData.result.sort((a: any, b: any) => a.blockTime - b.blockTime);
          const earliestSignature = sortedSignatures[0];
          
          if (earliestSignature.blockTime) {
            blockTime = earliestSignature.blockTime;
            createdAt = new Date(blockTime * 1000).toISOString();
            console.log(`Found signature creation date for ${nftAddress}: ${createdAt}`);
          }
        }
      }
      
      // Method 2: Try other metadata sources if no signature date
      if (!createdAt) {
        // Check metadata fields in the NFT data
        const possibleDates = [
          nftData.content?.metadata?.created_at,
          nftData.compression?.created_at,
          nftData.content?.metadata?.attributes?.find((attr: any) => 
            attr.trait_type === 'created' || 
            attr.trait_type === 'Creation Date'
          )?.value,
          collectionInfo?.creationDate,
          collectionInfo?.firstNftDate
        ].filter(Boolean);
        
        for (const dateStr of possibleDates) {
          if (!dateStr) continue;
          
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              // Reject future dates (likely errors)
              const now = Date.now();
              const oneDayInMs = 24 * 60 * 60 * 1000;
              if (date.getTime() > now + oneDayInMs) {
                console.warn(`Skipping future date ${date.toISOString()} for NFT ${nftAddress}`);
                continue;
              }
              
              createdAt = date.toISOString();
              console.log(`Found valid date ${createdAt} for NFT ${nftAddress}`);
              break;
            }
          } catch (e) {
            console.warn(`Error parsing date ${dateStr} for NFT ${nftAddress}:`, e);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching creation date for ${nftAddress}:`, error);
    }
    
    // If we still couldn't find a valid date, use a past date fallback
    if (!createdAt) {
      // Use a historical date (beginning of 2022) with a random offset for proper sorting
      const pastDate = new Date('2022-01-01T00:00:00Z').getTime();
      const randomOffset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000); // Random offset up to 30 days
      const fallbackTimestamp = pastDate + randomOffset;
      createdAt = new Date(fallbackTimestamp).toISOString();
      console.log(`Using fallback date for ${nftAddress}: ${createdAt}`);
    }

    // Ensure we have all required data
    return {
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
      // Store as timestamp string for consistent sorting
      createdAt: blockTime 
        ? (blockTime * 1000).toString() // Use blockTime (most reliable) 
        : new Date(createdAt).getTime().toString() // Parse from string
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

// Sort NFTs by creation date (newest first)
const sortNFTsByCreationDate = (a: NFT, b: NFT) => {
  // Add extensive logging to debug the comparison
  console.log(`SORTING INFO - Comparing NFTs:
    A: ${a.name} (${a.mint}), Date: ${a.createdAt} 
    B: ${b.name} (${b.mint}), Date: ${b.createdAt}`);
  
  // Try to get dates as millisecond timestamps
  let dateA: number | null = null;
  let dateB: number | null = null;
  
  // First try parsing as timestamp string
  if (a.createdAt && /^\d+$/.test(a.createdAt)) {
    dateA = parseInt(a.createdAt);
    console.log(`A parsed as numeric timestamp: ${dateA}, Date: ${new Date(dateA).toISOString()}`);
  }
  
  if (b.createdAt && /^\d+$/.test(b.createdAt)) {
    dateB = parseInt(b.createdAt);
    console.log(`B parsed as numeric timestamp: ${dateB}, Date: ${new Date(dateB).toISOString()}`);
  }
  
  // If still null, try parsing as ISO string
  if (dateA === null && a.createdAt) {
    try {
      const dateObj = new Date(a.createdAt);
      if (!isNaN(dateObj.getTime())) {
        dateA = dateObj.getTime();
        console.log(`A parsed as ISO string: ${dateA}, Date: ${dateObj.toISOString()}`);
      } else {
        console.log(`A has invalid date format: ${a.createdAt}`);
      }
    } catch (e) {
      console.error(`Error parsing date A: ${a.createdAt}`, e);
    }
  }
  
  if (dateB === null && b.createdAt) {
    try {
      const dateObj = new Date(b.createdAt);
      if (!isNaN(dateObj.getTime())) {
        dateB = dateObj.getTime();
        console.log(`B parsed as ISO string: ${dateB}, Date: ${dateObj.toISOString()}`);
      } else {
        console.log(`B has invalid date format: ${b.createdAt}`);
      }
    } catch (e) {
      console.error(`Error parsing date B: ${b.createdAt}`, e);
    }
  }

  // Compare the dates if we have them
  if (dateA !== null && dateB !== null) {
    console.log(`Comparing dates: A(${new Date(dateA).toISOString()}) vs B(${new Date(dateB).toISOString()})`);
    console.log(`Result: ${dateB > dateA ? 'B is newer' : 'A is newer'}, returning ${dateB - dateA}`);
    return dateB - dateA; // Descending order (newest first)
  }
  
  // Handle cases where one or both dates are missing
  if (dateA !== null) {
    console.log('Only A has date, A comes first');
    return -1; 
  }
  if (dateB !== null) {
    console.log('Only B has date, B comes first');
    return 1;
  }
  
  // If neither has a date, sort by mint for consistency
  console.log('No dates found, sorting by mint');
  return a.mint.localeCompare(b.mint);
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

// Add global image cache to window if it doesn't exist
if (typeof window !== 'undefined' && !window.nftImageCache) {
  window.nftImageCache = new Map<string, boolean>();
}

// Optimized preloadImages function that avoids redundant loading
const preloadImages = async (urls: string[], batchSize = 8, delayMs = 50) => {
  if (!urls || urls.length === 0) return;
  
  // Skip URLs that are already cached or null/undefined
  const urlsToLoad = urls.filter(url => 
    url && !window.nftImageCache.has(url)
  );
  
  if (urlsToLoad.length === 0) return;
  
  console.log(`Preloading ${urlsToLoad.length} NFT images in batches of ${batchSize}`);
  
  // Split URLs into batches
  const batches = chunk(urlsToLoad, batchSize);
  
  for (const batch of batches) {
    // Start loading all images in this batch concurrently
    const promises = batch.map(url => {
      return new Promise<void>(resolve => {
        // Skip if already cached while processing previous batches
        if (window.nftImageCache.has(url)) {
          resolve();
          return;
        }
        
        const img = new Image();
        
        // Single function to handle completion
        const onFinish = () => {
          img.onload = null;
          img.onerror = null;
          resolve();
        };
        
        img.onload = () => {
          window.nftImageCache.set(url, true);
          onFinish();
        };
        
        img.onerror = () => {
          window.nftImageCache.set(url, false);
          onFinish();
        };
        
        // If image is already cached by browser, onload may not fire
        if (img.complete) {
          window.nftImageCache.set(url, true);
          onFinish();
        } else {
          img.src = url;
        }
      });
    });
    
    // Wait for all images in this batch to load
    await Promise.all(promises).catch(err => {
      // Log errors but don't block the loading process
      console.error('Error preloading image batch:', err);
    });
    
    // Add a small delay between batches to avoid overwhelming the browser
    if (delayMs > 0 && batches.length > 1) {
      await delay(delayMs);
    }
  }
};

// Loading component with message
const LoadingIndicator = ({ message }: { message: string }) => (
  <Box sx={{ 
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center',
    height: '50vh',
    width: '100%',
    gap: 3
  }}>
    <CircularProgress size={50} thickness={4} />
    <Typography variant="h6" color="text.secondary" align="center">
      {message || 'Loading NFTs...'}
    </Typography>
  </Box>
);

// Function to normalize dates to ISO string format for consistent parsing
const parseAndNormalizeDate = (dateInput: string | number | undefined | null): string => {
  if (!dateInput) {
    return new Date().toISOString(); // Default to current time if no date provided
  }
  
  try {
    // If it's already a timestamp number, convert directly
    if (typeof dateInput === 'number') {
      return new Date(dateInput).toISOString();
    }
    
    // If it's a timestamp string (all digits), parse it directly
    if (typeof dateInput === 'string' && /^\d+$/.test(dateInput)) {
      return new Date(parseInt(dateInput)).toISOString();
    }
    
    // Try to parse as a date string
    const parsedDate = new Date(dateInput);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
    
    // Fallback to current time if date is invalid
    console.warn(`Could not parse date: ${dateInput}, using current time`);
    return new Date().toISOString();
  } catch (error) {
    console.error(`Error normalizing date ${dateInput}:`, error);
    return new Date().toISOString();
  }
};

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

  // Preload NFT images when they're loaded
  useEffect(() => {
    if (loadedNFTs.length > 0) {
      const imageUrls = loadedNFTs.map(nft => nft.image).filter(Boolean) as string[];
      preloadImages(imageUrls);
    }
  }, [loadedNFTs]);

  const fetchAllNFTs = async () => {
    console.log('=== Starting NFT Loading Process ===');
    setLoading(true);
    setError(null);
    setLoadedNFTs([]);
    setFilteredNFTs([]);
    setNFTs([]);
    setIsLoadingMore(false);
    setLoadingMessage('Loading collections...');
    
    try {
      // Fetch display names first
      console.log('1. Fetching display names...');
      await fetchDisplayNames();
      
      // Fetch collections from Google Sheets with exponential backoff
      let retryCount = 0;
      let collectionsData = null;
      
      setLoadingMessage('Fetching collections from API...');
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

      // Create an array to accumulate all NFTs
      const allNFTs: NFT[] = [];

      // 1. Handle Ultimate NFTs
      setLoadingMessage('Loading Ultimate NFTs...');
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
            allNFTs.push(nft);
          }
        });
        
        // Update the UI with initial NFTs immediately to show something quickly
        if (initialNFTs.length > 0) {
          setLoadedNFTs(initialNFTs);
          setNFTs(initialNFTs);
          setFilteredNFTs(initialNFTs);
          
          // Start preloading initial images
          const imageUrls = initialNFTs.map(nft => nft.image).filter(Boolean) as string[];
          preloadImages(imageUrls);
        }
      } catch (error) {
        console.error('Error pre-fetching initial NFTs:', error);
      }
        
      // 3. Process Ultimate NFTs - in small batches to avoid UI freezing
      setLoadingMessage('Loading more Ultimate NFTs...');
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
          setLoadingMessage(`Processing Ultimate NFTs (${processedCount}/${totalCount})...`);
          console.log(`Batch ${batchIndex + 1}: Processed ${processedCount}/${totalCount} NFTs`);
          
          // Add to allNFTs array
          allNFTs.push(...validNFTs);
          
          // Update UI every few batches to show progress without causing too many re-renders
          if (batchIndex % 3 === 2 || batchIndex === batches.length - 1) {
            setLoadedNFTs([...allNFTs]);
            setNFTs([...allNFTs]);
            setFilteredNFTs([...allNFTs]);
            
            // Preload images for this batch
            const batchImageUrls = validNFTs.map(nft => nft.image).filter(Boolean) as string[];
            preloadImages(batchImageUrls);
          }

          // Add a small delay between batches to keep UI responsive
          if (batchIndex < batches.length - 1) {
            await delay(100);
          }
        } catch (batchError) {
          console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
        }
      }
      
      // 4. Now load NFTs from regular collections
      console.log('6. Loading NFTs from regular collections...');
      
      // Process each regular collection
      for (const [collectionIndex, collection] of regularCollections.entries()) {
        try {
          setLoadingMessage(`Loading collection ${collectionIndex + 1}/${regularCollections.length}: ${collection.name}`);
          console.log(`Fetching NFTs for collection: ${collection.name} (${collection.address})`);
          const collectionNFTs = await fetchCollectionNFTsFromUtils(collection.address);
          
          // Map the NFT metadata to our NFT format
          const processedCollectionNFTs: NFT[] = [];
          
          for (const nftData of collectionNFTs) {
            // Process creation date correctly
            let createdAt = '';
            let blockTime = null;
            
            try {
              // Method 1: First try to get signatures (most reliable for mint date)
              const signaturesResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'my-id',
                  method: 'getSignaturesForAddress',
                  params: [nftData.mint, { limit: 20 }] // Get more signatures to find earliest
                })
              });

              if (signaturesResponse.ok) {
                const signaturesData = await signaturesResponse.json();
                if (signaturesData.result && signaturesData.result.length > 0) {
                  // Sort signatures to get the earliest one (mint transaction)
                  const sortedSignatures = signaturesData.result.sort((a: any, b: any) => a.blockTime - b.blockTime);
                  const earliestSignature = sortedSignatures[0];
                  
                  if (earliestSignature.blockTime) {
                    blockTime = earliestSignature.blockTime;
                    createdAt = new Date(blockTime * 1000).toISOString();
                    console.log(`Found signature creation date for ${nftData.mint}: ${createdAt}`);
                  }
                }
              }
              
              // Method 2: Try asset metadata as fallback
              if (!createdAt) {
                const assetResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAsset',
                    params: { id: nftData.mint }
                  })
                });

                if (assetResponse.ok) {
                  const assetData = await assetResponse.json();
                  
                  // For compressed NFTs
                  if (assetData.result?.compression?.compressed && assetData.result?.compression?.created_at) {
                    createdAt = assetData.result.compression.created_at;
                    console.log(`Found compression creation date for ${nftData.mint}: ${createdAt}`);
                  }
                  
                  // Try to get from metadata
                  if (!createdAt && assetData.result?.content?.metadata?.created_at) {
                    createdAt = assetData.result.content.metadata.created_at;
                    console.log(`Found metadata creation date for ${nftData.mint}: ${createdAt}`);
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching creation date for ${nftData.mint}:`, error);
            }
            
            // Fall back to NFT metadata or collection dates
            if (!createdAt) {
              if (collection.creationDate) {
                createdAt = collection.creationDate;
                console.log(`Using collection creation date for ${nftData.mint}: ${createdAt}`);
              } else if (collection.firstNftDate) {
                createdAt = collection.firstNftDate;
                console.log(`Using collection firstNftDate for ${nftData.mint}: ${createdAt}`);
              } else {
                // Only use a real past date as fallback, not a future date
                const pastDate = new Date('2022-01-01T00:00:00Z').getTime();
                const randomOffset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000); // Random offset up to 30 days
                const fallbackTimestamp = pastDate + randomOffset;
                createdAt = new Date(fallbackTimestamp).toISOString();
                console.log(`Using fallback date for ${nftData.mint}: ${createdAt}`);
              }
            }
            
            // Create NFT object from metadata
            const nft: NFT = {
              mint: nftData.mint,
              name: nftData.name || 'Unnamed NFT',
              image: nftData.image || '',
              description: nftData.description || '',
              attributes: [],
              // Use owner information from metadata if available
              owner: nftData.owner || {
                publicKey: 'Unknown',
                ownershipModel: 'single',
                delegated: false,
                delegate: null,
                frozen: false
              },
              listed: false,
              collectionName: collection.name,
              collectionAddress: collection.address,
              creators: [],
              royalty: 0,
              tokenStandard: 'NonFungible',
              // Store the timestamp for consistent sorting - ensure we use a valid date
              createdAt: blockTime 
                ? (blockTime * 1000).toString() // Use blockTime (most reliable) 
                : new Date(createdAt).getTime().toString() // Parse from string
            };
            
            processedCollectionNFTs.push(nft);
          }
          
          // Add to the allNFTs array
          allNFTs.push(...processedCollectionNFTs);
          
          // Batch update the UI to avoid too many re-renders
          setLoadedNFTs([...allNFTs]);
          setNFTs([...allNFTs]);
          setFilteredNFTs([...allNFTs]);
          
          // Preload images for this collection
          const collectionImageUrls = processedCollectionNFTs.map(nft => nft.image).filter(Boolean) as string[];
          preloadImages(collectionImageUrls);
          
          console.log(`Added ${processedCollectionNFTs.length} NFTs from collection ${collection.name}`);
          
          // Add a small delay between collections to avoid rate limiting
          await delay(200);
        } catch (error) {
          console.error(`Error fetching NFTs for collection ${collection.name}:`, error);
        }
      }
      
      console.log('7. All NFTs processed successfully');
      setLoadingMessage('');
      
      // Final UI update with all NFTs
      setLoadedNFTs(allNFTs);
      setNFTs(allNFTs);
      setFilteredNFTs(allNFTs);
      
    } catch (error) {
      console.error('Error in fetchAllNFTs:', error);
      setError('Failed to load NFTs. Please try again later.');
    } finally {
      // Make sure loading stops even if there's an error
      setLoading(false);
      setLoadingMessage('');
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
    const searchLower = searchTerm.toLowerCase();
    const selectedCollectionLower = selectedCollection.toLowerCase();
    
    return nfts.filter(nft => {
      const nftName = nft.name?.toLowerCase() || '';
      const collectionName = nft.collectionName?.toLowerCase() || '';
      
      // Check if the NFT matches the search term
      const matchesSearch = searchTerm === '' || 
        nftName.includes(searchLower) || 
        collectionName.includes(searchLower);
      
      // Check if the NFT matches the selected collection
      // If no collection is selected, all NFTs match
      const matchesCollection = selectedCollection === '' || 
        collectionName === selectedCollectionLower;
      
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
  const groupedNFTs = useMemo(() => {
    // Filter the NFTs based on current filters
    const filtered = filterNFTs(nfts, searchTerm, selectedCollection);
    
    // If showing "My NFTs" or if a specific collection is selected, we don't need to group
    if (showMyNFTs || selectedCollection) {
      return [{ 
        collection: showMyNFTs ? 'My NFTs' : (selectedCollection || 'All NFTs'), 
        nfts: filtered.sort(sortNFTsByCreationDate)
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
        collection: collectionName, 
        nfts: nfts.sort(sortNFTsByCreationDate)
      }))
      .sort((a, b) => a.collection.localeCompare(b.collection));
  }, [nfts, searchTerm, selectedCollection, showMyNFTs, filterNFTs]);
  
  // Get the current page's NFTs, possibly from multiple collections
  const currentPageGroupedNFTs = useMemo(() => {
    // If we have a specific collection or showing My NFTs, just paginate the single group
    if (showMyNFTs || selectedCollection) {
      const group = groupedNFTs[0];
      return [{
        collection: group.collection,
        nfts: group.nfts.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
      }];
    }
    
    // We need to paginate across all collections
    let nftsCount = 0;
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = page * ITEMS_PER_PAGE;
    
    // Find which collections should be included on this page
    const result: { collection: string; nfts: NFT[] }[] = [];
    
    for (const group of groupedNFTs) {
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
          collection: group.collection,
          nfts: collectionNFTs
        });
      }
      
      nftsCount += group.nfts.length;
    }
    
    return result;
  }, [groupedNFTs, page, showMyNFTs, selectedCollection]);
  
  // Calculate total filtered NFTs for pagination
  const totalFilteredNFTs = useMemo(() => {
    return groupedNFTs.reduce((acc, group) => acc + group.nfts.length, 0);
  }, [groupedNFTs]);
  
  // Update page count based on total filtered NFTs
  const pageCount = Math.ceil(totalFilteredNFTs / ITEMS_PER_PAGE);

  // Handle page change
  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo(0, 0);
  };

  // Calculate card width based on screen size
  const cardWidth = useMemo(() => {
    if (isLargeScreen) return 3; // 4 cards per row on large screens
    return 0; // Let MUI handle it on smaller screens
  }, [isLargeScreen]);

  // Handle refresh button click
  const handleRefresh = () => {
    // Reset filters
    setSearchTerm('');
    setSelectedCollection('');
    setPage(1);
    
    // Refetch NFTs
    fetchAllNFTs();
  };

  return (
    <Container maxWidth="xl" sx={{ pt: 2, pb: 5 }}>
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search NFTs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              size="small"
            />
          </Grid>
          
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="collection-select-label">Collection</InputLabel>
              <Select
                labelId="collection-select-label"
                id="collection-select"
                value={selectedCollection}
                label="Collection"
                onChange={e => {
                  const value = e.target.value as string;
                  console.log('Selected collection:', value);
                  console.log('NFTs in collection:', nfts.filter(nft => 
                    nft.collectionName.toLowerCase() === value.toLowerCase()
                  ).length);
                  setSelectedCollection(value);
                }}
              >
                <MenuItem value="">All Collections</MenuItem>
                {consolidatedCollections.map(collection => (
                  <MenuItem key={collection.name} value={collection.name}>
                    {collection.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          {connected && (
            <Grid item xs={12} sm={4} md={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showMyNFTs}
                    onChange={e => setShowMyNFTs(e.target.checked)}
                  />
                }
                label="Show My NFTs"
              />
            </Grid>
          )}
          
          <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' } }}>
            <IconButton 
              onClick={handleRefresh} 
              disabled={loading}
              size="small"
              color="primary"
              sx={{ 
                backgroundColor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 1,
                '&:hover': {
                  backgroundColor: 'action.hover',
                }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Grid>
        </Grid>
      </Box>
      
      <Box sx={{ width: '100%', mb: 3 }}>
        {error && (
          <Typography color="error" align="center" gutterBottom>
            {error}
          </Typography>
        )}
        
        {loading && filteredNFTs.length === 0 ? (
          <LoadingIndicator message={loadingMessage} />
        ) : (
          <Grid container spacing={isMobile ? 2 : 3}>
            {currentPageGroupedNFTs.map((group) => (
              <React.Fragment key={group.collection}>
                {/* Only show header when it's not "No Collection" group or if there are multiple collections */}
                {(group.collection !== 'No Collection' || groupedNFTs.length > 1) && (
                  <Grid item xs={12}>
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        mt: groupedNFTs.length > 1 ? 4 : 0, 
                        mb: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        pb: 1,
                        fontFamily: '"Dancing Script", cursive',
                        fontSize: '2rem'
                      }}
                    >
                      {group.collection}
                    </Typography>
                  </Grid>
                )}
                
                <Grid item xs={12}>
                  <Grid 
                    container 
                    spacing={isMobile ? 2.1 : 2.8}
                    justifyContent="flex-start"
                    sx={{
                      mt: { xs: 0, sm: -1 }, // Fix for spacing issues
                    }}
                  >
                    {group.nfts.map((nft) => (
                      <Grid 
                        item 
                        key={nft.mint} 
                        xs={12} sm={6} md={4} lg={cardWidth > 0 ? cardWidth : 3}
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
                          nft={nft}
                          wallet={{ publicKey }}
                          connected={connected}
                          displayName={nft.owner ? 
                            displayNames.get(
                              typeof nft.owner === 'string' ? 
                                nft.owner.toLowerCase() : 
                                (nft.owner.publicKey ? nft.owner.publicKey.toLowerCase() : '')
                            ) : 
                            undefined
                          }
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
              </React.Fragment>
            ))}
            
            {/* Loading indicator */}
            {(loading || isLoadingMore) && filteredNFTs.length > 0 && (
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
                    {loadingMessage || 'Loading more NFTs...'}
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
            
            {!loading && filteredNFTs.length === 0 && (
              <Grid item xs={12}>
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '30vh',
                  width: '100%',
                  gap: 2
                }}>
                  <Typography variant="h6" color="text.secondary">
                    No NFTs found
                  </Typography>
                  <Button 
                    variant="outlined" 
                    onClick={handleRefresh}
                    startIcon={<RefreshIcon />}
                  >
                    Refresh
                  </Button>
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    </Container>
  );
};

export default Market; 