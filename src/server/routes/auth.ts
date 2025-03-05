import express from 'express';
import { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Get the authorized minter address from environment variables
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';

if (!AUTHORIZED_MINTER) {
  console.warn('WARNING: AUTHORIZED_MINTER environment variable is not set. No wallet will be authorized to mint NFTs.');
}

// Check if a wallet is authorized to mint NFTs
router.get('/check-minter/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required'
      });
    }
    
    // Check if the wallet address is in the list of authorized minters
    const isAuthorized = walletAddress === AUTHORIZED_MINTER;
    
    return res.json({
      success: true,
      isAuthorized
    });
  } catch (error) {
    console.error('Error checking minter authorization:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while checking authorization'
    });
  }
});

export default router; 