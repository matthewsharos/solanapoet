import { useState, useEffect, useMemo } from 'react';
import { NFT } from '../types/nft';
import { fetchAllNFTs } from '../services/nftService';
import { enhancedSortNFTsByCreationDate } from '../utils/nftSorting';

export const useMarketData = () => {
  // State for loading and data management
  const [loadedNFTs, setLoadedNFTs] = useState<NFT[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<NFT[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [sorted, setSorted] = useState(false);
  
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
  
  // Handle sorting by date
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
  
  // Load all NFTs
  const loadAllNFTs = async () => {
    setIsLoadingNFTs(true);
    setLoadingMessage('Fetching NFTs...');
    setLoadedNFTs([]);
    setFilteredNFTs([]);
    setSorted(false);
    
    try {
      const nfts = await fetchAllNFTs(
        sorted,
        (updatedNFTs) => {
          setLoadedNFTs(updatedNFTs);
          setFilteredNFTs(updatedNFTs);
        },
        setLoadingMessage
      );
      
      setLoadedNFTs(nfts);
      setFilteredNFTs(nfts);
      setIsLoadingNFTs(false);
      setLoadingMessage('');
    } catch (error) {
      console.error('Error loading NFTs:', error);
      setIsLoadingNFTs(false);
      setLoadingMessage('Error loading NFTs.');
    }
  };
  
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
  
  // Load NFTs when component mounts
  useEffect(() => {
    loadAllNFTs();
  }, []);
  
  return {
    // State
    loadedNFTs,
    filteredNFTs,
    currentNFTs,
    searchQuery,
    isLoadingNFTs,
    loadingMessage,
    currentPage,
    totalPages,
    sorted,
    
    // Actions
    handleSearchChange,
    handlePageChange,
    handleSortByDate,
    loadAllNFTs
  };
}; 