import { Connection, PublicKey, Transaction, TransactionSignature, Commitment } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

export interface TransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: Commitment;
  maxRetries?: number;
}

export interface TransactionResponse {
  signature: TransactionSignature;
  success: boolean;
  error?: any;
}

export type WalletInterface = WalletContextState | {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: TransactionOptions
  ) => Promise<string>;
};

export interface ServerResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
} 