import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  TextField, 
  Button, 
  Paper, 
  Grid, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Divider,
  Alert,
  CircularProgress,
  IconButton
} from '@mui/material';
import { styled } from '@mui/system';
import { useWalletContext } from '../contexts/WalletContext';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import { uploadFileToPinata, createAndUploadMetadata } from '../utils/pinata';
import CollectionManager from '../components/CollectionManager';

// Helper function to get API base URL
const getApiBaseUrl = async () => {
  const response = await axios.get('/api/config');
  if (!response.data.success) {
    throw new Error('Failed to fetch API base URL');
  }
  return response.data.baseUrl;
};

// Styled components for vintage look
const MintContainer = styled(Paper)({
  backgroundColor: '#f8f5e6',
  padding: '2rem',
  border: '1px solid #d4af37',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  marginBottom: '2rem',
});

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

const SectionTitle = styled(Typography)({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '1.9rem',
  fontWeight: '600',
  marginBottom: '1.2rem',
  marginTop: '1.5rem',
  color: '#262626',
  position: 'relative',
  textShadow: '2px 2px 3px rgba(0,0,0,0.15)',
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

const ImagePreview = styled(Box)({
  width: '100%',
  height: '300px',
  border: '1px dashed #b8860b',
  borderRadius: '4px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: '1rem',
  overflow: 'hidden',
  backgroundColor: '#f0ead6',
  '& .MuiTypography-root': {
    fontFamily: '"Arial", "Helvetica", sans-serif',
  }
});

interface Attribute {
  trait_type: string;
  value: string;
}

const Mint: React.FC = () => {
  const { publicKey, isAuthorizedMinter } = useWalletContext();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [symbol, setSymbol] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [attributes, setAttributes] = useState<Attribute[]>([{ trait_type: '', value: '' }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  useEffect(() => {
    // Redirect if not authorized
    if (!publicKey || !isAuthorizedMinter) {
      navigate('/market');
      return;
    }
    
    // Fetch collections from localStorage
    const fetchCollections = () => {
      setLoadingCollections(true);
      try {
        const storedCollections = localStorage.getItem('collections');
        if (storedCollections) {
          setCollections(JSON.parse(storedCollections));
        }
      } catch (err) {
        console.error('Error fetching collections from localStorage:', err);
      } finally {
        setLoadingCollections(false);
      }
    };
    
    fetchCollections();
  }, [publicKey, isAuthorizedMinter, navigate]);

  // If not authorized, don't render the component
  if (!publicKey || !isAuthorizedMinter) {
    return null;
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddAttribute = () => {
    setAttributes([...attributes, { trait_type: '', value: '' }]);
  };

  const handleRemoveAttribute = (index: number) => {
    const newAttributes = [...attributes];
    newAttributes.splice(index, 1);
    setAttributes(newAttributes);
  };

  const handleAttributeChange = (index: number, field: 'trait_type' | 'value', value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index][field] = value;
    setAttributes(newAttributes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (!isAuthorizedMinter) {
      setError('You are not authorized to mint NFTs');
      return;
    }
    
    if (!name || !description || !symbol || !selectedCollection || !imageFile) {
      setError('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Filter out empty attributes
      const validAttributes = attributes.filter(
        attr => attr.trait_type.trim() !== '' && attr.value.trim() !== ''
      );
      
      // Upload image to IPFS via Pinata
      const imageHash = await uploadFileToPinata(imageFile);
      
      // Create and upload metadata to IPFS
      const metadataHash = await createAndUploadMetadata(
        name,
        description,
        imageHash,
        validAttributes,
        symbol
      );
      
      // Create form data for server request
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('symbol', symbol);
      formData.append('collectionId', selectedCollection);
      formData.append('walletAddress', publicKey.toString());
      formData.append('image', imageFile);
      formData.append('attributes', JSON.stringify(validAttributes));
      
      // Get dynamic API base URL
      const apiBaseUrl = await getApiBaseUrl();
      
      // Send to server
      const response = await axios.post(`${apiBaseUrl}/api/nft/mint`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setSuccess('NFT minted successfully!');
        
        // Reset form
        setName('');
        setDescription('');
        setSymbol('');
        setSelectedCollection('');
        setAttributes([{ trait_type: '', value: '' }]);
        setImageFile(null);
        setImagePreview(null);
      } else {
        setError(response.data.message || 'Error minting NFT');
      }
    } catch (err: any) {
      setError(err.message || 'Error minting NFT. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <PageTitle variant="h1">Mint Your NFT</PageTitle>
      
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
      
      <MintContainer>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <SectionTitle variant="h2">NFT Details</SectionTitle>
              
              <TextField
                label="NFT Name"
                variant="outlined"
                fullWidth
                margin="normal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                InputProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
                InputLabelProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
              />
              
              <TextField
                label="Description"
                variant="outlined"
                fullWidth
                margin="normal"
                multiline
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                InputProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
                InputLabelProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
              />
              
              <TextField
                label="Symbol"
                variant="outlined"
                fullWidth
                margin="normal"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
                InputProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
                InputLabelProps={{
                  style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                }}
              />
              
              <FormControl fullWidth margin="normal" required>
                <InputLabel style={{ fontFamily: '"Arial", "Helvetica", sans-serif' }}>Collection</InputLabel>
                <Select
                  value={selectedCollection}
                  label="Collection"
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  disabled={loadingCollections}
                  sx={{ fontFamily: '"Arial", "Helvetica", sans-serif' }}
                >
                  {collections.map((collection) => (
                    <MenuItem 
                      key={collection.collectionId} 
                      value={collection.collectionId}
                      sx={{ fontFamily: '"Arial", "Helvetica", sans-serif' }}
                    >
                      {collection.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <SectionTitle variant="h2">NFT Image</SectionTitle>
              
              <ImagePreview>
                {imagePreview ? (
                  <img 
                    src={imagePreview} 
                    alt="NFT Preview" 
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                  />
                ) : (
                  <Typography variant="body1" color="text.secondary">
                    Image Preview
                  </Typography>
                )}
              </ImagePreview>
              
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ 
                  mb: 2,
                  fontFamily: '"Arial", "Helvetica", sans-serif',
                  letterSpacing: '0.05rem',
                  fontWeight: '500'
                }}
              >
                Upload Image
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </Button>
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <SectionTitle variant="h2">
                Attributes
                <IconButton 
                  color="primary" 
                  onClick={handleAddAttribute}
                  sx={{ ml: 1 }}
                >
                  <AddIcon />
                </IconButton>
              </SectionTitle>
              
              {attributes.map((attr, index) => (
                <Box key={index} sx={{ display: 'flex', mb: 2, gap: 2 }}>
                  <TextField
                    label="Trait Type"
                    variant="outlined"
                    fullWidth
                    value={attr.trait_type}
                    onChange={(e) => handleAttributeChange(index, 'trait_type', e.target.value)}
                    InputProps={{
                      style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                    }}
                    InputLabelProps={{
                      style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                    }}
                  />
                  <TextField
                    label="Value"
                    variant="outlined"
                    fullWidth
                    value={attr.value}
                    onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                    InputProps={{
                      style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                    }}
                    InputLabelProps={{
                      style: { fontFamily: '"Arial", "Helvetica", sans-serif' }
                    }}
                  />
                  {attributes.length > 1 && (
                    <IconButton 
                      color="error" 
                      onClick={() => handleRemoveAttribute(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Grid>
            
            <Grid item xs={12} sx={{ textAlign: 'center', mt: 2 }}>
              <VintageButton
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {loading ? 'Minting...' : 'Mint NFT'}
              </VintageButton>
            </Grid>
          </Grid>
        </form>
      </MintContainer>
      
      <CollectionManager />
    </Box>
  );
};

export default Mint; 