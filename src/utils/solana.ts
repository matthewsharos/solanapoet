import { Connection, Transaction, TransactionSignature, PublicKey } from '@solana/web3.js';
import { WalletInterface, TransactionOptions, TransactionResponse } from '../types/common';

export const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  skipPreflight: false,
  preflightCommitment: 'processed',
  maxRetries: 3
};

export async function sendTransactionWithRetry(
  wallet: WalletInterface,
  connection: Connection,
  transaction: Transaction,
  options: TransactionOptions = DEFAULT_TRANSACTION_OPTIONS
): Promise<TransactionResponse> {
  let signature: TransactionSignature;
  let retries = 0;
  const maxRetries = options.maxRetries ?? DEFAULT_TRANSACTION_OPTIONS.maxRetries;

  while (retries <= maxRetries) {
    try {
      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // Get a fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign and send transaction
      signature = await wallet.sendTransaction(transaction, connection, options);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
      }

      return {
        signature,
        success: true
      };
    } catch (error) {
      retries++;
      if (retries > maxRetries) {
        return {
          signature: '',
          success: false,
          error
        };
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }

  return {
    signature: '',
    success: false,
    error: new Error('Max retries exceeded')
  };
}

export function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount);
    return Number(balance.value.amount);
  } catch {
    return 0;
  }
}

export async function getSOLBalance(
  connection: Connection,
  address: PublicKey
): Promise<number> {
  try {
    const balance = await connection.getBalance(address);
    return balance / 1e9; // Convert lamports to SOL
  } catch {
    return 0;
  }
} 