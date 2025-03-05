import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import axios from 'axios';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  CircularProgress, 
  Alert, 
  Stepper, 
  Step, 
  StepLabel 
} from '@mui/material';

const ListNFT = () => {
  const { publicKey, signTransaction, connected } = useWallet();
  const [nftMint, setNftMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [escrowTokenAccount, setEscrowTokenAccount] = useState('');
  
  const steps = [
    'Connect Wallet',
    'Create Escrow Account',
    'Transfer NFT to Escrow',
    'Complete Listing'
  ];

  // Handle NFT mint address input
  const handleNftMintChange = (e) => {
    setNftMint(e.target.value);
  };

  // Step 1: Create escrow token account
  const handleCreateEscrow = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!nftMint) {
      setError('Please enter an NFT mint address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Call the API to create the escrow token account transaction
      const response = await axios.post('/api/listing/create-escrow', {
        nftMint,
        sellerWallet: publicKey.toString()
      });

      // If the escrow account already exists, skip to step 2
      if (response.data.exists) {
        setEscrowTokenAccount(response.data.escrowTokenAccount);
        setSuccess('Escrow token account already exists. Proceeding to transfer NFT.');
        setActiveStep(2);
        setLoading(false);
        return;
      }

      // Deserialize the transaction
      const transaction = Transaction.from(
        Buffer.from(response.data.transaction, 'base64')
      );

      // Sign the transaction
      const signedTransaction = await signTransaction(transaction);

      // Serialize the signed transaction
      const serializedTransaction = signedTransaction.serialize().toString('base64');

      // Send the signed transaction to the server to be sent to the network
      const confirmResponse = await axios.post('/api/transactions/send', {
        signedTransaction: serializedTransaction
      });

      if (confirmResponse.data.success) {
        setEscrowTokenAccount(response.data.escrowTokenAccount);
        setSuccess('Escrow token account created successfully!');
        setActiveStep(2);
      } else {
        setError('Failed to create escrow token account: ' + confirmResponse.data.error);
      }
    } catch (error) {
      console.error('Error creating escrow token account:', error);
      setError(error.response?.data?.error || error.message || 'Failed to create escrow token account');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Transfer NFT to escrow
  const handleTransferNFT = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!nftMint) {
      setError('Please enter an NFT mint address');
      return;
    }

    if (!escrowTokenAccount) {
      setError('Escrow token account not created yet');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Call the API to create the NFT transfer transaction
      const response = await axios.post('/api/listing/transfer-nft', {
        nftMint,
        sellerWallet: publicKey.toString(),
        escrowTokenAccount
      });

      if (!response.data.success) {
        setError('Failed to create NFT transfer transaction: ' + response.data.error);
        setLoading(false);
        return;
      }

      // Deserialize the transaction
      const transaction = Transaction.from(
        Buffer.from(response.data.transaction, 'base64')
      );

      // Sign the transaction
      const signedTransaction = await signTransaction(transaction);

      // Serialize the signed transaction
      const serializedTransaction = signedTransaction.serialize().toString('base64');

      // Send the signed transaction to the server to be sent to the network
      const confirmResponse = await axios.post('/api/transactions/send', {
        signedTransaction: serializedTransaction
      });

      if (confirmResponse.data.success) {
        setSuccess('NFT transferred to escrow successfully!');
        setActiveStep(3);
      } else {
        setError('Failed to transfer NFT: ' + confirmResponse.data.error);
      }
    } catch (error) {
      console.error('Error transferring NFT:', error);
      setError(error.response?.data?.error || error.message || 'Failed to transfer NFT');
    } finally {
      setLoading(false);
    }
  };

  // Combined function to handle the entire listing process
  const handleListNFT = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!nftMint) {
      setError('Please enter an NFT mint address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Call the API to start the listing process
      const response = await axios.post('/api/listing/list-nft', {
        nftMint,
        sellerWallet: publicKey.toString()
      });

      // Set the current step based on the response
      setActiveStep(response.data.step);
      
      // If escrow account exists, store it
      if (response.data.escrowTokenAccount) {
        setEscrowTokenAccount(response.data.escrowTokenAccount);
      }

      // If we need to create the escrow account first
      if (response.data.step === 1 && response.data.transaction) {
        // Deserialize the transaction
        const transaction = Transaction.from(
          Buffer.from(response.data.transaction, 'base64')
        );

        // Sign the transaction
        const signedTransaction = await signTransaction(transaction);

        // Serialize the signed transaction
        const serializedTransaction = signedTransaction.serialize().toString('base64');

        // Send the signed transaction to the server to be sent to the network
        const confirmResponse = await axios.post('/api/transactions/send', {
          signedTransaction: serializedTransaction
        });

        if (confirmResponse.data.success) {
          setSuccess('Escrow token account created successfully! Now transferring NFT...');
          
          // Proceed to step 2 (transfer NFT)
          await handleTransferNFT();
        } else {
          setError('Failed to create escrow token account: ' + confirmResponse.data.error);
        }
      } 
      // If escrow account already exists, proceed to transfer NFT
      else if (response.data.step === 2) {
        setSuccess('Escrow token account already exists. Proceeding to transfer NFT...');
        await handleTransferNFT();
      }
    } catch (error) {
      console.error('Error listing NFT:', error);
      setError(error.response?.data?.error || error.message || 'Failed to list NFT');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        List Your NFT
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {!connected ? (
        <Box sx={{ textAlign: 'center', my: 3 }}>
          <Typography variant="body1" gutterBottom>
            Please connect your wallet to list an NFT
          </Typography>
          <WalletMultiButton />
        </Box>
      ) : (
        <Box component="form" noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="nftMint"
            label="NFT Mint Address"
            name="nftMint"
            value={nftMint}
            onChange={handleNftMintChange}
            disabled={loading}
          />

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            {activeStep < 2 ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleCreateEscrow}
                disabled={loading || !nftMint}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : 'Create Escrow Account'}
              </Button>
            ) : activeStep === 2 ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleTransferNFT}
                disabled={loading || !nftMint || !escrowTokenAccount}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : 'Transfer NFT to Escrow'}
              </Button>
            ) : (
              <Typography variant="body1" color="success.main" sx={{ mt: 2 }}>
                NFT Listed Successfully!
              </Typography>
            )}
          </Box>

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleListNFT}
              disabled={loading || !nftMint || activeStep >= 3}
              fullWidth
            >
              {loading ? <CircularProgress size={24} /> : 'List NFT (All Steps)'}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default ListNFT; 