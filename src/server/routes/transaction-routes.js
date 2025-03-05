/**
 * Transaction Routes
 * 
 * This file defines the API routes for sending transactions to the Solana network.
 */

import express from 'express';
import { sendSignedTransaction } from '../transaction-service.js';

const router = express.Router();

/**
 * @route POST /api/transactions/send
 * @description Send a signed transaction to the Solana network
 * @access Public
 */
router.post('/send', async (req, res) => {
  try {
    const { signedTransaction } = req.body;
    
    // Validate required parameters
    if (!signedTransaction) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameter: signedTransaction' 
      });
    }
    
    // Send the signed transaction
    const result = await sendSignedTransaction(signedTransaction);
    
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Error sending transaction:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error' 
    });
  }
});

export default router; 