import { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { createPurchaseInstruction } from '../../../utils/marketplace';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mint } = req.body;

    if (!mint) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Initialize Solana connection
    const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
    
    // Create purchase instruction
    const instruction = await createPurchaseInstruction(
      new PublicKey(mint),
      new PublicKey(req.body.buyer) // The buyer's public key should be passed from the client
    );

    // Send the transaction
    // Note: This is a simplified version. In a real implementation,
    // you would need to handle signatures, transaction building, and confirmation

    // For now, we'll just return a mock success response
    return res.status(200).json({
      nft: {
        mint,
        listingPrice: null, // Remove listing price after purchase
        lastSoldPrice: req.body.price, // Update last sold price
        // ... other NFT fields would be included here
      }
    });
  } catch (error) {
    console.error('Error purchasing NFT:', error);
    return res.status(500).json({ error: 'Failed to purchase NFT' });
  }
} 