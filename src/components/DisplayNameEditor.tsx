import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField, 
  Button, 
  Typography,
  Box,
  CircularProgress
} from '@mui/material';
import { useWalletContext } from '../contexts/WalletContext';
import { formatWalletAddress } from '../utils/helpers';
import { displayNames } from '../api/client';

interface DisplayNameEditorProps {
  open: boolean;
  onClose: () => void;
}

const DisplayNameEditor: React.FC<DisplayNameEditorProps> = ({ open, onClose }) => {
  const { publicKey } = useWalletContext();
  const [displayName, setDisplayName] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing display name when dialog opens
  useEffect(() => {
    if (open && publicKey) {
      loadExistingDisplayName();
    } else {
      // Reset state when dialog closes
      setDisplayName('');
      setCurrentDisplayName(null);
      setError(null);
      setSuccess(false);
    }
  }, [open, publicKey]);

  // Load the user's existing display name if it exists
  const loadExistingDisplayName = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    try {
      const walletAddress = publicKey.toString();
      console.log('Fetching display name for wallet:', walletAddress);
      
      const existingName = await displayNames.get(walletAddress);
      
      console.log('Fetched display name result:', existingName);
      
      if (existingName) {
        setDisplayName(existingName);
        setCurrentDisplayName(existingName);
      } else {
        // If no display name exists, leave the input empty but show formatted address as current
        setDisplayName('');
        setCurrentDisplayName(null);
      }
    } catch (e) {
      console.error('Error loading display name:', e);
      setError('Failed to load display name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Save the display name
  const handleSave = async () => {
    if (!publicKey) {
      setError('Wallet not connected');
      return;
    }

    if (!displayName) {
      setError('Display name cannot be empty');
      return;
    }

    // Validate the display name
    if (displayName.length > 20) {
      setError('Display name must be 20 characters or less');
      return;
    }

    setLoading(true);
    try {
      const walletAddress = publicKey.toString();
      console.log(`Updating display name for ${walletAddress} to "${displayName.trim()}"`);
      
      // First update all local components to give instant feedback
      // This will apply the change visually even before the server confirms
      const event = new CustomEvent('displayNamesUpdated', {
        detail: {
          displayNames: {
            [walletAddress]: displayName.trim(),
            __forceRefresh: true,
            __updatedAddress: walletAddress,
            __timestamp: Date.now()
          }
        }
      });
      window.dispatchEvent(event);
      
      // Now update on the server
      await displayNames.update(walletAddress, displayName.trim());
      
      setSuccess(true);
      setError(null);
      setCurrentDisplayName(displayName.trim());
      
      // Close after success
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (e) {
      console.error('Error saving display name:', e);
      setError('Failed to save display name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Clear error when user types
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    setError(null);
    setSuccess(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ 
        fontFamily: '"Satisfy", "Dancing Script", cursive',
        fontSize: '1.8rem',
        textAlign: 'center',
        background: '#f8f5e6',
        borderBottom: '1px solid #d4af37'
      }}>
        Set Display Name
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3, background: '#f8f5e6' }}>
        {!publicKey ? (
          <Typography color="error" align="center" sx={{ my: 2 }}>
            Please connect your wallet to set a display name
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Your display name will be shown instead of your wallet address when displaying NFTs you own.
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#666' }}>
                Current Display Name:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {loading ? (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                ) : currentDisplayName || formatWalletAddress(publicKey.toString())}
              </Typography>
            </Box>
            
            <TextField
              autoFocus
              margin="dense"
              label="New Display Name"
              fullWidth
              variant="outlined"
              value={displayName}
              onChange={handleNameChange}
              error={!!error}
              helperText={error}
              disabled={loading}
              InputProps={{
                sx: { fontFamily: '"Arial", "Helvetica", sans-serif' }
              }}
              InputLabelProps={{
                sx: { fontFamily: '"Arial", "Helvetica", sans-serif' }
              }}
            />
            
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" sx={{ color: '#666' }}>
                Your wallet: {formatWalletAddress(publicKey.toString())}
              </Typography>
            </Box>
            
            {success && (
              <Typography color="success.main" sx={{ mt: 2, textAlign: 'center' }}>
                Display name saved successfully!
              </Typography>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ background: '#f8f5e6', borderTop: '1px solid #d4af37', p: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={!publicKey || loading || (displayName === currentDisplayName)}
          sx={{
            backgroundColor: '#d4af37',
            '&:hover': {
              backgroundColor: '#b4941f'
            }
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DisplayNameEditor; 