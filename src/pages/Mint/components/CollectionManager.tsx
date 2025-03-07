import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useWalletContext } from '../../../contexts/WalletContext';
import { Collection } from '../../../types/api';
import { collections } from '../../../api/client';

// Styled components for vintage look
const CollectionContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  backgroundColor: '#f5f5f5',
  borderRadius: theme.shape.borderRadius,
}));

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '&:nth-of-type(odd)': {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
}));

interface CollectionManagerProps {
  onCollectionSelect?: (collection: Collection) => void;
}

const CollectionManager: React.FC<CollectionManagerProps> = ({ onCollectionSelect }) => {
  const { publicKey, isAuthorizedMinter } = useWalletContext();
  const [collectionList, setCollectionList] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedCollections = await collections.fetch();
      setCollectionList(fetchedCollections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCollections();
  }, []);

  const handleAddCollection = async (newCollection: Collection) => {
    try {
      await collections.add(newCollection);
      await loadCollections();
      setSuccess('Collection added successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add collection');
    }
  };

  const handleRemoveCollection = async (address: string) => {
    try {
      await collections.remove(address);
      await loadCollections();
      setSuccess('Collection removed successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collection');
    }
  };

  const handleUpdateCollection = async (collection: Collection) => {
    try {
      await collections.update(collection);
      await loadCollections();
      setSuccess('Collection updated successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update collection');
    }
  };

  if (!isAuthorizedMinter) {
    return null;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <CollectionContainer>
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      {success && (
        <Typography color="success.main" sx={{ mb: 2 }}>
          {success}
        </Typography>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5">Collections</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            // Open add collection dialog
          }}
        >
          Add Collection
        </Button>
      </Box>
      <Table>
        <TableHead>
          <TableRow>
            <StyledTableCell>Name</StyledTableCell>
            <StyledTableCell>Address</StyledTableCell>
            <StyledTableCell>Created</StyledTableCell>
            <StyledTableCell>Actions</StyledTableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {collectionList.length === 0 ? (
            <StyledTableRow>
              <StyledTableCell colSpan={4} align="center">
                No collections found
              </StyledTableCell>
            </StyledTableRow>
          ) : (
            collectionList.map((collection) => (
              <StyledTableRow key={collection.address}>
                <StyledTableCell>{collection.name}</StyledTableCell>
                <StyledTableCell>{collection.address}</StyledTableCell>
                <StyledTableCell>
                  {collection.createdAt
                    ? new Date(collection.createdAt).toLocaleDateString()
                    : 'N/A'}
                </StyledTableCell>
                <StyledTableCell>
                  <Button
                    onClick={() => onCollectionSelect?.(collection)}
                    sx={{ mr: 1 }}
                  >
                    Select
                  </Button>
                  <Button
                    onClick={() => handleUpdateCollection(collection)}
                    sx={{ mr: 1 }}
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleRemoveCollection(collection.address)}
                    color="error"
                  >
                    Remove
                  </Button>
                </StyledTableCell>
              </StyledTableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CollectionContainer>
  );
};

export default CollectionManager; 