import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Checkbox
} from '@mui/material';
import { styled } from '@mui/system';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import { useWalletContext } from '../contexts/WalletContext';
// Import collections API functions
import { fetchCollections as fetchCollectionsFromApi, addCollection, removeCollection, updateCollection, Collection as ApiCollection, updateCollectionUltimates } from '../api/collections';

// Styled components for vintage look
const ManagerContainer = styled(Paper)({
  backgroundColor: '#f8f5e6',
  padding: '2rem',
  border: '1px solid #d4af37',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  marginBottom: '2rem',
  marginTop: '2rem',
});

const SectionTitle = styled(Typography)({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '1.9rem',
  fontWeight: '600',
  marginBottom: '1.2rem',
  color: '#262626',
  position: 'relative',
  textShadow: '2px 2px 3px rgba(0,0,0,0.15)',
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: '-10px',
    left: '0',
    width: '120px',
    height: '3px',
    backgroundColor: '#b8860b',
  },
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
    transform: 'translateY(0)',
    boxShadow: '0 4px 0 #222222',
  },
  '&:active': {
    backgroundColor: '#d8d8d8',
    transform: 'translateY(4px)',
    boxShadow: '0 0px 0 #222222',
  },
});

const StyledTableContainer = styled(TableContainer)({
  marginTop: '1.5rem',
  border: '1px solid #d4af37',
});

const StyledTableHead = styled(TableHead)({
  backgroundColor: '#d2b48c',
});

const StyledTableCell = styled(TableCell)({
  '&.MuiTableCell-head': {
    fontFamily: '"Satisfy", "Dancing Script", cursive',
    fontSize: '1.4rem',
    fontWeight: '600',
    color: '#5c4033',
    textShadow: '2px 2px 2px rgba(0,0,0,0.15)',
  },
  '&.MuiTableCell-body': {
    fontFamily: '"Arial", "Helvetica", sans-serif',
    color: '#333333',
  },
  borderBottom: '1px solid #d4af37',
});

const StyledTableRow = styled(TableRow)({
  '&:nth-of-type(odd)': {
    backgroundColor: 'rgba(210, 180, 140, 0.1)',
  },
  '&:hover': {
    backgroundColor: 'rgba(210, 180, 140, 0.2)',
  },
});

// Define local Collection type that matches the API Collection type
interface Collection {
  collectionId: string;
  name: string;
  firstNftDate: string;
  createdAt: string;
  ultimates: boolean;
}

interface CollectionResponse {
  collectionId: string;
  name: string;
  firstNftDate: string;
  createdAt: string;
  ultimates: string | boolean | string[];
}

const CollectionManager: React.FC = () => {
  const { publicKey, isAuthorizedMinter } = useWalletContext();
  
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Add a refresh key to force re-fetch
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  
  // Add collection dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCollectionId, setNewCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [addingCollection, setAddingCollection] = useState(false);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCollection, setEditCollection] = useState<Collection | null>(null);
  const [editName, setEditName] = useState('');
  const [editUltimates, setEditUltimates] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCollection, setDeleteCollection] = useState<Collection | null>(null);
  
  // Enhanced fetch collections function with stronger cache busting
  const fetchCollections = async (showLoading = true, forceRefresh = false) => {
    // Prevent multiple rapid refreshes unless forced
    const currentTime = Date.now();
    if (!forceRefresh && currentTime - lastRefreshTime < 300) {
      console.log('Skipping refresh, too soon after last refresh');
      return;
    }
    
    setLastRefreshTime(currentTime);
    
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    
    try {
      // Fetch collections from the API with cache-busting query param
      const collectionsData = await fetchCollectionsFromApi();
      
      console.log(`Fetched ${collectionsData.length} collections from API:`, collectionsData);
      
      // Map API collection format to our component's collection format
      const formattedCollections = collectionsData.map(collection => {
        // Convert ultimates to boolean
        const ultimatesValue = collection.ultimates === true || 
          (typeof collection.ultimates === 'string' && String(collection.ultimates).toUpperCase() === 'TRUE');

        return {
          collectionId: collection.address,
          name: collection.name,
          firstNftDate: collection.creationDate || (collection.addedAt ? new Date(collection.addedAt).toISOString() : new Date().toISOString()),
          createdAt: collection.addedAt ? new Date(collection.addedAt).toISOString() : new Date().toISOString(),
          ultimates: ultimatesValue
        } as Collection;
      });
      
      // Ensure we're not setting the same collections array reference
      if (JSON.stringify(collections) !== JSON.stringify(formattedCollections)) {
        console.log('Collections have changed, updating state');
        setCollections(formattedCollections);
      } else {
        console.log('Collections unchanged');
      }
    } catch (err) {
      console.error('Error fetching collections from API:', err);
      setError('Failed to fetch collections. Please try again.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };
  
  // Improved refresh collections function
  const handleRefresh = () => {
    console.log('Manually refreshing collections...');
    setRefreshKey(prevKey => prevKey + 1); // Increment refresh key to trigger useEffect
    fetchCollections(true, true); // Pass true to show loading indicator and force refresh
  };
  
  useEffect(() => {
    console.log('useEffect triggered, fetching collections...');
    fetchCollections();
    
    // Poll for updates every 10 seconds
    const intervalId = setInterval(() => {
      console.log('Polling for collection updates...');
      fetchCollections(false);
    }, 10000);
    
    return () => clearInterval(intervalId);
    // Adding refreshKey as a dependency will cause the effect to run when refreshKey changes
  }, [refreshKey]);
  
  // Format date
  const formatDate = (dateString: string) => {
    try {
      console.log(`Formatting date: ${dateString}`);
      const date = new Date(dateString);
      console.log(`Parsed date: ${date.toString()}`);
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date: ${dateString}`);
        return 'Unknown Date';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error(`Error formatting date ${dateString}:`, error);
      return 'Error in Date';
    }
  };
  
  // Handle add dialog open
  const handleAddOpen = () => {
    setAddDialogOpen(true);
    setNewCollectionId('');
    setNewCollectionName('');
    setError(null);
  };
  
  // Handle add dialog close
  const handleAddClose = () => {
    setAddDialogOpen(false);
    setNewCollectionId('');
    setNewCollectionName('');
  };
  
  // Validate collection ID format
  const isValidCollectionId = (id: string) => {
    // Basic validation for Solana address format (base58 string)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
  };
  
  // Enhanced handle add collection
  const handleAddCollection = async () => {
    if (!newCollectionId.trim()) {
      setError('Please enter a valid collection ID');
      return;
    }
    
    if (!isValidCollectionId(newCollectionId)) {
      setError('Invalid collection ID format. Please enter a valid Solana address.');
      return;
    }
    
    setAddingCollection(true);
    setError(null);
    
    try {
      // Initialize with user-provided name if available
      let collectionName = newCollectionName.trim();
      let firstNftDate = new Date().toISOString();
      let fetchedFromAPI = false;
      
      // Special case for known collections
      if (newCollectionId === '5J48WyJo3tWBaDRkoNH7cFcKP24KbWuoJUkAmWhDWVC5') {
        // This is the "Physicals" collection with a known creation date
        collectionName = "Physicals";
        // Set creation date to March 19, 2024
        firstNftDate = new Date('2024-03-19T00:00:00Z').toISOString();
        fetchedFromAPI = true;
      } else {
        // Try to fetch collection data from Helius DAS API
        try {
          // First, try to get the asset directly (most reliable for collection metadata)
          const assetResponse = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getAsset',
            params: {
              id: newCollectionId
            }
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (assetResponse.data?.result) {
            const asset = assetResponse.data.result;
            
            // If user didn't provide a name, try to determine a collection name
            if (!collectionName) {
              // Try to get name from content metadata
              if (asset.content?.metadata?.name) {
                collectionName = asset.content.metadata.name;
              } else if (asset.content?.metadata?.symbol) {
                collectionName = asset.content.metadata.symbol;
              }
            }
            
            // Try to get creation date from transaction history
            try {
              // Get more transactions to find the earliest one
              console.log(`Fetching transaction history for collection: ${newCollectionId}`);
              const txResponse = await axios.get(`https://api.helius.xyz/v0/addresses/${newCollectionId}/transactions?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d&limit=20`);
              
              console.log(`Found ${txResponse.data?.length || 0} transactions`);
              
              if (txResponse.data && txResponse.data.length > 0) {
                // Find the earliest transaction by comparing timestamps
                let earliestTimestamp = Number.MAX_SAFE_INTEGER;
                let earliestTx = null;
                
                txResponse.data.forEach((tx: any) => {
                  if (tx.timestamp) {
                    console.log(`Transaction timestamp: ${tx.timestamp}`);
                    if (tx.timestamp < earliestTimestamp) {
                      earliestTimestamp = tx.timestamp;
                      earliestTx = tx;
                    }
                  }
                });
                
                if (earliestTimestamp !== Number.MAX_SAFE_INTEGER) {
                  // Convert timestamp to date
                  const txDate = new Date(earliestTimestamp * 1000);
                  const now = new Date();
                  // Validate timestamp is reasonable (not in the future)
                  if (txDate <= now) {
                    firstNftDate = txDate.toISOString();
                    console.log(`Found earliest transaction with timestamp: ${earliestTimestamp}`);
                    console.log(`Setting creation date for collection to: ${firstNftDate}`);
                  }
                } else {
                  console.log(`No valid timestamps found in transactions for ${newCollectionId}`);
                }
              } else {
                console.log(`No transactions found for ${newCollectionId}`);
              }
            } catch (txError) {
              console.error('Error fetching transaction history:', txError);
              // Continue with default date
            }
            
            fetchedFromAPI = true;
          }
          
          // If we couldn't get direct asset info, try to get assets by group
          if (!fetchedFromAPI) {
            const response = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`, {
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getAssetsByGroup',
              params: {
                groupKey: 'collection',
                groupValue: newCollectionId,
                page: 1,
                limit: 1
              }
            }, {
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            // Check if collection exists and has NFTs
            if (response.data?.result?.items && response.data.result.items.length > 0) {
              const firstNft = response.data.result.items[0];
              
              // If user didn't provide a name, try to determine a collection name
              // Priority order for collection name:
              // 1. User provided name (already set above)
              // 2. Collection level metadata (grouping.collection_metadata)
              // 3. NFT's collection symbol
              // 4. NFT's name with numbering removed
              // 5. Default name with collection ID
              
              if (!collectionName) {
                // Try to get collection name from grouping metadata (most accurate)
                if (firstNft.grouping && 
                    firstNft.grouping.find((g: any) => g.group_key === 'collection')?.collection_metadata?.name) {
                  const collectionGroup = firstNft.grouping.find((g: any) => g.group_key === 'collection');
                  collectionName = collectionGroup.collection_metadata.name;
                }
                // Try to get collection name from the NFT's content metadata
                else if (firstNft.content?.metadata?.symbol) {
                  collectionName = firstNft.content.metadata.symbol;
                }
                // Use the NFT name but remove any numbering patterns
                else if (firstNft.content?.metadata?.name) {
                  const nftName = firstNft.content.metadata.name;
                  // Remove common numbering patterns like "#123", "123/456", etc.
                  collectionName = nftName.replace(/#\d+$/, '').replace(/\s*\d+\/\d+$/, '').trim();
                  
                  // If the name still has numbers at the end, it might be part of a series
                  if (/\s+\d+$/.test(collectionName)) {
                    collectionName = collectionName.replace(/\s+\d+$/, '').trim();
                  }
                }
              }
              
              // Try to get the creation date from the NFT
              if (firstNft.content?.metadata?.attributes) {
                const createdAttr = firstNft.content.metadata.attributes.find(
                  (attr: any) => attr.trait_type === 'created' || attr.trait_type === 'Creation Date'
                );
                
                if (createdAttr?.value) {
                  firstNftDate = new Date(createdAttr.value).toISOString();
                }
              }
              
              fetchedFromAPI = true;
            }
          }
        } catch (apiError) {
          console.error('API error:', apiError);
          // Continue with user-provided name or default
        }
      }
      
      // If we still don't have a name, use a default
      if (!collectionName) {
        collectionName = `Collection ${newCollectionId.substring(0, 8)}...`;
      }
      
      // Create new collection object
      const newCollection: Collection = {
        collectionId: newCollectionId,
        name: collectionName,
        firstNftDate: firstNftDate,
        createdAt: new Date().toISOString(),
        ultimates: false
      };
      
      // Check if collection already exists
      const existingCollection = collections.find(c => c.collectionId === newCollectionId);
      if (existingCollection) {
        setError('This collection ID already exists in your list.');
        setAddingCollection(false);
        return;
      }
      
      // Add directly to Google Sheets API
      const apiCollection: ApiCollection = {
        address: newCollectionId,
        name: collectionName,
        description: '',
        addedAt: Date.now(),
        creationDate: firstNftDate,
        ultimates: false
      };
      
      console.log('Adding collection to API:', apiCollection);
      const success = await addCollection(apiCollection);
      
      if (success) {
        // Run the ultimate NFT search script
        try {
          const response = await fetch('/api/search-ultimates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              collectionId: newCollectionId
            })
          });

          if (response.ok) {
            const { ultimateNfts } = await response.json();
            if (ultimateNfts?.length > 0) {
              // Update the collection with found ultimate NFTs
              await updateCollectionUltimates(newCollectionId, ultimateNfts.map((nft: any) => nft.id));
            }
          }
        } catch (searchError) {
          console.error('Error searching for ultimate NFTs:', searchError);
          // Continue anyway - the collection is added, we just couldn't find ultimates
        }

        setSuccess('Collection added successfully!');
        setCollections([...collections, newCollection]);
      } else {
        setError('Failed to add collection to Google Sheets.');
      }
    } catch (error) {
      console.error('Error adding collection:', error);
      setError('Failed to add collection. Please try again.');
    } finally {
      setAddingCollection(false);
    }
  };
  
  // Handle edit dialog open
  const handleEditOpen = (collection: Collection) => {
    setEditCollection(collection);
    setEditName(collection.name);
    setEditUltimates(collection.ultimates);
    setEditDialogOpen(true);
  };
  
  // Handle edit dialog close
  const handleEditClose = () => {
    setEditDialogOpen(false);
    setEditCollection(null);
  };
  
  // Handle delete dialog open
  const handleDeleteOpen = (collection: Collection) => {
    setDeleteCollection(collection);
    setDeleteDialogOpen(true);
  };
  
  // Handle delete dialog close
  const handleDeleteClose = () => {
    setDeleteDialogOpen(false);
    setDeleteCollection(null);
  };
  
  // Enhanced handle edit submit
  const handleEditSubmit = async () => {
    if (!editCollection) return;
    
    try {
      console.log(`Updating collection: ${editCollection.collectionId} with name: ${editName} and ultimates: ${editUltimates}`);
      
      const success = await updateCollection(editCollection.collectionId, editName, editUltimates);
      
      if (success) {
        console.log('Collection updated successfully, refreshing data...');
        
        // Show immediate success message
        setSuccess('Collection updated successfully!');
        handleEditClose();
        
        // Force immediate refresh first
        await fetchCollections(false, true);
        
        // Then do a second refresh after delay to catch any backend propagation delays
        setTimeout(async () => {
          await fetchCollections(false, true);
          console.log('Collections refreshed after update (delayed refresh)');
        }, 1000);
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        throw new Error('Failed to update collection in API');
      }
    } catch (err) {
      console.error('Error updating collection:', err);
      setError('Failed to update collection. Please try again.');
      
      // Clear error message after 3 seconds
      setTimeout(() => {
        setError(null);
      }, 3000);
    }
  };
  
  // Enhanced handle delete submit
  const handleDeleteSubmit = async () => {
    if (!deleteCollection) return;
    
    try {
      console.log(`Deleting collection: ${deleteCollection.collectionId}`);
      // Delete collection directly from Google Sheets API
      const success = await removeCollection(deleteCollection.collectionId);
      
      if (success) {
        console.log('Collection deleted successfully, refreshing data...');
        
        // Show immediate success message
        setSuccess('Collection deleted successfully!');
        handleDeleteClose();
        
        // Force immediate refresh first
        await fetchCollections(false, true);
        
        // Then do a second refresh after delay to catch any backend propagation delays
        setTimeout(async () => {
          await fetchCollections(false, true);
          console.log('Collections refreshed after deletion (delayed refresh)');
        }, 1000);
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } else {
        throw new Error('Failed to delete collection from API');
      }
    } catch (err) {
      console.error('Error deleting collection:', err);
      setError('Failed to delete collection. Please try again.');
      
      // Clear error message after 3 seconds
      setTimeout(() => {
        setError(null);
      }, 3000);
    }
  };
  
  const handleFilterChange = async (collection: Collection, ultimates: string[]) => {
    try {
      // Update collection with new ultimates
      const updatedCollection = {
        ...collection,
        ultimates: ultimates.length > 0
      };

      // Update local state
      setCollections(collections.map(c =>
        c.collectionId === collection.collectionId
          ? updatedCollection
          : c
      ));

      // Update backend
      await updateCollectionUltimates(collection.collectionId, ultimates);
      setSuccess('Collection updated successfully');
    } catch (error) {
      console.error('Error updating collection:', error);
      setError('Failed to update collection');
    }
  };
  
  const handleUpdateCollection = (collection: Collection) => {
    setCollections(collections.map(c => 
      c.collectionId === collection.collectionId ? collection : c
    ));
  };
  
  if (!isAuthorizedMinter) {
    return null;
  }
  
  return (
    <ManagerContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SectionTitle variant="h2">Collection Manager</SectionTitle>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Tooltip title="Refresh collections">
            <IconButton 
              onClick={handleRefresh} 
              disabled={loading}
              sx={{ mr: 1 }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <VintageButton 
            variant="contained" 
            startIcon={<AddIcon />}
            onClick={handleAddOpen}
          >
            Add Collection
          </VintageButton>
        </Box>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <StyledTableContainer>
          <Table>
            <StyledTableHead>
              <TableRow>
                <StyledTableCell>Title</StyledTableCell>
                <StyledTableCell>Creation Date</StyledTableCell>
                <StyledTableCell>Collection ID</StyledTableCell>
                <StyledTableCell>Ultimate NFTs</StyledTableCell>
                <StyledTableCell align="right">Actions</StyledTableCell>
              </TableRow>
            </StyledTableHead>
            <TableBody>
              {collections.length === 0 ? (
                <StyledTableRow>
                  <StyledTableCell colSpan={5} align="center">
                    No collections found. Add a collection to get started.
                  </StyledTableCell>
                </StyledTableRow>
              ) : (
                collections.map((collection) => (
                  <StyledTableRow key={collection.collectionId}>
                    <StyledTableCell>{collection.name}</StyledTableCell>
                    <StyledTableCell>{formatDate(collection.firstNftDate)}</StyledTableCell>
                    <StyledTableCell>{collection.collectionId}</StyledTableCell>
                    <StyledTableCell>{collection.ultimates ? 'Yes' : 'No'}</StyledTableCell>
                    <StyledTableCell align="right">
                      <Button
                        startIcon={<EditIcon />}
                        onClick={() => handleEditOpen(collection)}
                        sx={{ mr: 1 }}
                      >
                        Edit
                      </Button>
                      <Button
                        startIcon={<DeleteIcon />}
                        color="error"
                        onClick={() => handleDeleteOpen(collection)}
                      >
                        Delete
                      </Button>
                    </StyledTableCell>
                  </StyledTableRow>
                ))
              )}
            </TableBody>
          </Table>
        </StyledTableContainer>
      )}
      
      {/* Add Collection Dialog */}
      <Dialog open={addDialogOpen} onClose={handleAddClose}>
        <DialogTitle>Add Collection</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter a valid Solana collection ID to add it to your list of valid collections.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Collection ID"
            type="text"
            fullWidth
            variant="outlined"
            value={newCollectionId}
            onChange={(e) => setNewCollectionId(e.target.value)}
            disabled={addingCollection}
            sx={{ mb: 2 }}
            helperText="Enter the Solana address of the collection"
          />
          <TextField
            margin="dense"
            label="Collection Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            disabled={addingCollection}
            helperText="Enter your preferred name for this collection (recommended)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAddClose} disabled={addingCollection}>Cancel</Button>
          <VintageButton 
            onClick={handleAddCollection} 
            variant="contained"
            disabled={addingCollection}
            startIcon={addingCollection ? <CircularProgress size={20} /> : null}
          >
            {addingCollection ? 'Adding...' : 'Add Collection'}
          </VintageButton>
        </DialogActions>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditClose}>
        <DialogTitle>Edit Collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Collection Name"
            type="text"
            fullWidth
            variant="outlined"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <Checkbox
              checked={editUltimates}
              onChange={(e) => setEditUltimates(e.target.checked)}
              color="primary"
            />
            <Typography>Show Ultimate NFTs</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <VintageButton onClick={handleEditSubmit} variant="contained">
            Save Changes
          </VintageButton>
        </DialogActions>
      </Dialog>
      
      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteClose}>
        <DialogTitle>Delete Collection</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the collection "{deleteCollection?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose}>Cancel</Button>
          <Button onClick={handleDeleteSubmit} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </ManagerContainer>
  );
};

export default CollectionManager; 