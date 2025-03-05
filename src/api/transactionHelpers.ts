import { 
  Connection, 
  Transaction, 
  PublicKey, 
  Commitment,
  TransactionSignature
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Define interfaces for transaction handling
interface TransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: Commitment;
  maxRetries?: number;
}

interface TransactionResponse {
  signature: TransactionSignature;
  success: boolean;
  error?: any;
}

// Define WalletInterface to match the WalletContextState or similar wallet structure
type WalletInterface = WalletContextState | {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: TransactionOptions
  ) => Promise<string>;
};

/**
 * Sends a transaction with fallback retry logic
 */
export async function sendTransactionWithFallback(
  wallet: WalletInterface,
  transaction: Transaction,
  connection: Connection,
  nftAddress: string,
  buyerAddress: string,
  responseData?: any,
  notifyServer?: (address: string, signature: string, status: string) => Promise<boolean>
): Promise<string | null> {
  const notify = async (signature: string, status: string) => {
    if (notifyServer) {
      try {
        await notifyServer(nftAddress, signature, status);
      } catch (error) {
        console.error('Failed to notify server:', error);
      }
    }
  };

  try {
    // Standard approach first
    const options: TransactionOptions = {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3
    };

    try {
      const signature = await wallet.sendTransaction(transaction, connection, options);
      console.log('Transaction sent successfully:', signature);
      await notify(signature, 'Pending');
      return signature;
    } catch (error) {
      console.warn('Standard transaction approach failed:', error);
    }

    // Fallback approach with more basic options
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    const fallbackOptions: TransactionOptions = {
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 5
    };

    const signature = await wallet.sendTransaction(transaction, connection, fallbackOptions);
    console.log('Fallback transaction successful:', signature);
    await notify(signature, 'Pending');
    return signature;

  } catch (error) {
    console.error('All transaction attempts failed:', error);
    return null;
  }
} 