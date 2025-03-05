import { NextApiRequest, NextApiResponse } from 'next';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { createListingInstruction } from '../../../utils/marketplace';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mint, price, owner } = req.body;

    if (!mint || !price || !owner) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Initialize Solana connection
    const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
    
    // Create listing instructions
    const instructions = await createListingInstruction(
      new PublicKey(mint),
      price,
      new PublicKey(owner)
    );

    // Create and sign transaction
    const transaction = new Transaction().add(...instructions);
    
    // Set recent blockhash and fee payer
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = new PublicKey(owner);

    // Return the serialized transaction for the client to sign
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });

    return res.status(200).json({
      transaction: serializedTransaction.toString('base64'),
      message: 'Transaction created successfully'
    });
  } catch (error) {
    console.error('Error creating listing transaction:', error);
    return res.status(500).json({ error: 'Failed to create listing transaction' });
  }
} 