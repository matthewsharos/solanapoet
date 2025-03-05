/**
 * NFT Listing Routes
 * 
 * This file defines the API routes for listing NFTs on the marketplace.
 */

import express from 'express';
import { 
  createEscrowTokenAccountTransaction, 
  createNftTransferTransaction, 
  listNft 
} from '../listing-service.js';

const router = express.Router();

/**
 * @route POST /api/listing/create-escrow
 * @description Create an escrow token account transaction for an NFT
 * @access Public
 */
router.post('/create-escrow', async (req, res) => {
  try {
    const { nftMint, sellerWallet } = req.body;
    
    // Validate required parameters
    if (!nftMint || !sellerWallet) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: nftMint and sellerWallet are required' 
      });
    }
    
    // Create the escrow token account transaction
    const result = await createEscrowTokenAccountTransaction(nftMint, sellerWallet);
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error creating escrow token account transaction:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error' 
    });
  }
});

/**
 * @route POST /api/listing/transfer-nft
 * @description Create a transaction to transfer an NFT to the escrow token account
 * @access Public
 */
router.post('/transfer-nft', async (req, res) => {
  try {
    const { nftMint, sellerWallet, escrowTokenAccount } = req.body;
    
    // Validate required parameters
    if (!nftMint || !sellerWallet || !escrowTokenAccount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: nftMint, sellerWallet, and escrowTokenAccount are required' 
      });
    }
    
    // Create the NFT transfer transaction
    const result = await createNftTransferTransaction(nftMint, sellerWallet, escrowTokenAccount);
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error creating NFT transfer transaction:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error' 
    });
  }
});

/**
 * @route POST /api/listing/list-nft
 * @description List an NFT on the marketplace (handles both steps)
 * @access Public
 */
router.post('/list-nft', async (req, res) => {
  try {
    const { nftMint, sellerWallet } = req.body;
    
    // Validate required parameters
    if (!nftMint || !sellerWallet) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: nftMint and sellerWallet are required' 
      });
    }
    
    // List the NFT
    const result = await listNft(nftMint, sellerWallet);
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error listing NFT:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error' 
    });
  }
});

export default router; 