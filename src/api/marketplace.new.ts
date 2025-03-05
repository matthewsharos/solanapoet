import { NFT, NFTOwner } from '../types/nft';
import { 
  Connection, 
  Transaction, 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  SystemProgram, 
  TransactionInstruction, 
  sendAndConfirmTransaction, 
  Commitment,
  TransactionSignature,
  VersionedTransaction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction
} from '@solana/spl-token';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Keypair } from '@solana/web3.js';
import { isOriginalSeller } from './escrow';
import { useWallet } from '@solana/wallet-adapter-react';
import { getListing } from '../api/storage';
import { sendTransactionWithFallback } from './transactionHelpers';

// Types and Interfaces
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

interface WalletInterface {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: TransactionOptions
  ) => Promise<string>;
  connected?: boolean;
}

type NFTWithObjectOwner = Omit<NFT, 'owner'> & {
  owner: string | NFTOwner;
};

interface StoredListing {
  price: number;
  sellerAddress: string;
  timestamp: number;
}

// Helper Functions
const getOwnerAddress = (owner: string | any): string => {
  if (typeof owner === 'string') {
    return owner;
  }
  return owner?.publicKey || '';
};

const ensureConnection = (connection?: Connection): Connection => {
  if (connection) {
    return connection;
  }
  const heliusMainnetRpcUrl = 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d';
  return new Connection(heliusMainnetRpcUrl, 'confirmed');
};

const getApiBaseUrl = async (): Promise<string> => {
  const ports = [3002, 3001, 3011, 3021, 3031, 3041];
  
  for (const port of ports) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) {
        try {
          localStorage.setItem('active_server_port', port.toString());
        } catch (e) {
          console.warn('Could not store port in localStorage:', e);
        }
        return `http://localhost:${port}`;
      }
    } catch (error) {
      console.log(`Server not available on port ${port}`);
    }
  }
  
  try {
    const savedPort = localStorage.getItem('active_server_port');
    if (savedPort) {
      return `http://localhost:${parseInt(savedPort, 10)}`;
    }
  } catch (e) {
    console.warn('Could not access localStorage:', e);
  }
  
  return 'http://localhost:3002';
};

const isNFT = (obj: any): obj is NFT => {
  return obj && typeof obj === 'object' && 'mint' in obj && !('owner' in obj && typeof obj.owner === 'object');
};

const notifyServerTransactionFailed = async (nftAddress: string, buyerAddress: string): Promise<void> => {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/purchase-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nftAddress, buyerAddress })
    });
    
    if (!response.ok) {
      console.error('Failed to notify server about transaction failure:', response.statusText);
    }
  } catch (error) {
    console.error('Error notifying server about transaction failure:', error);
  }
};

const notifyServer = async (
  nftAddress: string, 
  signature: string, 
  status: string = 'Sold'
): Promise<boolean> => {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/confirm-purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nftAddress, signature, status })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error notifying server about purchase:', error);
    return false;
  }
};

// Transaction Handling Functions
const handlePhantomTransaction = async (
  wallet: WalletInterface,
  transaction: Transaction,
  connection: Connection,
  nftAddress: string,
  ownerAddress: string
): Promise<string | null> => {
  try {
    // @ts-ignore - Access the solana object on window
    const provider = (window as any).solana;
    
    if (provider?.isPhantom) {
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey || undefined;
      
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');
      
      const result = await provider.signAndSendTransaction(serializedTransaction);
      if (result?.signature) {
        await notifyServer(nftAddress, result.signature, 'Pending');
        return result.signature;
      }
    }
    return null;
  } catch (error) {
    console.error('Phantom transaction failed:', error);
    return null;
  }
};

const handleStandardTransaction = async (
  wallet: WalletInterface,
  transaction: Transaction,
  connection: Connection,
  nftAddress: string,
  ownerAddress: string
): Promise<string | null> => {
  try {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey || undefined;
    
    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: true,
      preflightCommitment: 'confirmed'
    });
    
    await notifyServer(nftAddress, signature, 'Pending');
    return signature;
  } catch (error) {
    console.error('Standard transaction failed:', error);
    await notifyServerTransactionFailed(nftAddress, ownerAddress);
    return null;
  }
};

// Main Functions
export const listNFTForSale = async (
  nft: NFT | NFTWithObjectOwner,
  price: number,
  ownerAddressOrWallet: string | WalletInterface | null = null,
  connectionOrCallback: Connection | ((confirmed: boolean) => void) = () => {},
  walletOrMaxRetries: WalletInterface | number = 3
): Promise<boolean> => {
  try {
    let ownerAddress = '';
    let wallet: WalletInterface | null = null;
    let connection: Connection | undefined;
    let setTransactionConfirmed: (confirmed: boolean) => void = () => {};
    
    // Parameter normalization
    if (typeof ownerAddressOrWallet === 'string') {
      ownerAddress = ownerAddressOrWallet;
      if (connectionOrCallback instanceof Connection) {
        connection = connectionOrCallback;
      }
      if (typeof walletOrMaxRetries !== 'number') {
        wallet = walletOrMaxRetries;
      }
    } else {
      wallet = ownerAddressOrWallet;
      if (wallet?.publicKey) {
        ownerAddress = wallet.publicKey.toString();
      }
      if (typeof connectionOrCallback === 'function') {
        setTransactionConfirmed = connectionOrCallback;
      } else if (connectionOrCallback instanceof Connection) {
        connection = connectionOrCallback;
      }
    }
    
    if (!ownerAddress) {
      if ('owner' in nft && nft.owner) {
        ownerAddress = typeof nft.owner === 'string' ? nft.owner : '';
      } else if ('ownerAddress' in nft && nft.ownerAddress) {
        ownerAddress = typeof nft.ownerAddress === 'string' ? nft.ownerAddress : '';
      }
    }
    
    if (!ownerAddress) {
      console.error('Owner address not found');
      setTransactionConfirmed(false);
      return false;
    }
    
    connection = connection || ensureConnection();
    const nftAddress = typeof nft === 'string' ? nft : nft.mint;
    const apiBaseUrl = await getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/api/market/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nftAddress,
        price,
        walletAddress: ownerAddress,
      })
    });
    
    if (!response.ok) {
      setTransactionConfirmed(false);
      return false;
    }
    
    const responseData = await response.json();
    
    if (responseData.transaction && wallet) {
      try {
        const transactionBuffer = Buffer.from(responseData.transaction, 'base64');
        const transaction = Transaction.from(transactionBuffer);
        
        // Try Phantom first
        const phantomSignature = await handlePhantomTransaction(
          wallet,
          transaction,
          connection,
          nftAddress,
          ownerAddress
        );
        
        if (phantomSignature) {
          setTransactionConfirmed(true);
          return true;
        }
        
        // Fall back to standard approach
        const standardSignature = await handleStandardTransaction(
          wallet,
          transaction,
          connection,
          nftAddress,
          ownerAddress
        );
        
        if (standardSignature) {
          setTransactionConfirmed(true);
          return true;
        }
        
        setTransactionConfirmed(false);
        return false;
      } catch (error) {
        console.error('Transaction failed:', error);
        setTransactionConfirmed(false);
        return false;
      }
    }
    
    setTransactionConfirmed(true);
    return true;
  } catch (error) {
    console.error('Error in listNFTForSale:', error);
    if (typeof connectionOrCallback === 'function') {
      connectionOrCallback(false);
    }
    return false;
  }
};

export const unlistNFT = async (
  nft: NFT | string,
  ownerAddress: string,
  connection?: Connection,
  wallet?: WalletInterface
): Promise<boolean> => {
  try {
    const nftAddress = typeof nft === 'string' ? nft : nft.mint;
    connection = connection || ensureConnection();
    
    const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
    if (ownerAddress === ROYALTY_RECEIVER_ADDRESS) {
      const isActuallySeller = await isOriginalSeller(nftAddress, ownerAddress);
      if (!isActuallySeller) {
        return false;
      }
    }
    
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/unlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nftAddress,
        ownerAddress
      })
    });
    
    if (!response.ok) {
      if ((await response.text()).includes('NFT is not in escrow')) {
        const updateResponse = await fetch(`${apiBaseUrl}/api/market/update-listing-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nftAddress,
            status: 'Unlisted'
          })
        });
        
        return updateResponse.ok;
      }
      return false;
    }
    
    const responseData = await response.json();
    
    if (responseData.transaction && wallet) {
      try {
        const transactionBuffer = Buffer.from(responseData.transaction, 'base64');
        const transaction = Transaction.from(transactionBuffer);
        
        // Try Phantom first
        const phantomSignature = await handlePhantomTransaction(
          wallet,
          transaction,
          connection,
          nftAddress,
          ownerAddress
        );
        
        if (phantomSignature) {
          return true;
        }
        
        // Fall back to standard approach
        const standardSignature = await handleStandardTransaction(
          wallet,
          transaction,
          connection,
          nftAddress,
          ownerAddress
        );
        
        return !!standardSignature;
      } catch (error) {
        console.error('Transaction failed:', error);
        await notifyServerTransactionFailed(nftAddress, ownerAddress);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in unlistNFT:', error);
    return false;
  }
};

// Export types
export type { 
  TransactionOptions, 
  TransactionResponse, 
  NFTWithObjectOwner, 
  StoredListing,
  WalletInterface 
}; 