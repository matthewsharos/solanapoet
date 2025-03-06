import express, { Request, Response, Router } from 'express';
import { getOAuth2Client } from '../utils/google';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// Get the authorized minter address from environment variables
const AUTHORIZED_MINTER = process.env.AUTHORIZED_MINTER || '';

if (!AUTHORIZED_MINTER) {
  console.warn('WARNING: AUTHORIZED_MINTER environment variable is not set. No wallet will be authorized to mint NFTs.');
}

type CheckMinterParams = {
  walletAddress: string;
};

// Check if a wallet is authorized to mint NFTs
router.get<CheckMinterParams>('/check-minter/:walletAddress', (req: Request<CheckMinterParams>, res: Response): void => {
  const { walletAddress } = req.params;
  
  if (!walletAddress) {
    res.status(400).json({ error: 'Wallet address is required' });
    return;
  }

  const isAuthorized = walletAddress.toLowerCase() === AUTHORIZED_MINTER.toLowerCase();
  res.json({ isAuthorized });
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    // ... existing code ...
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
});

export default router; 