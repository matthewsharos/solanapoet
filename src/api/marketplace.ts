import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Commitment,
  TransactionSignature,
  VersionedTransaction,
  Keypair,
} from '@solana/web3.js';

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import { WalletContextState } from '@solana/wallet-adapter-react';
import { fetchListing } from './market/listings';
import { sendTransactionWithFallback } from './transactionHelpers';
import { isOriginalSeller } from './escrow';
import bs58 from 'bs58';
import { callPurchaseSuccessPopupCallback } from './purchaseCallbacks';
import { createSheetsClient, GOOGLE_SHEETS_CONFIG } from './googleSheetsConfig';
import { NFT, NFTOwner } from '../types/nft';
import { getHeliusApiKey } from '../utils/config';

// Types and Interfaces
interface TransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: Commitment;
  maxRetries?: number;
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

interface NFTWithObjectOwner extends Omit<NFT, 'owner'> {
  owner: string | NFTOwner;
  ownerAddress?: string;
}

interface TransactionResponse {
  signature: TransactionSignature;
  success: boolean;
  error?: any;
}

interface StoredListing {
  price: number;
  sellerAddress: string;
  timestamp: number;
}

// Cache for the Helius connection
let cachedConnection: Connection | null = null;
let lastConnectionTime: number = 0;
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Helper Functions
const getOwnerAddress = (owner: string | any): string => {
  if (typeof owner === 'string') {
    return owner;
  }
  return owner?.publicKey || '';
};

const ensureConnection = async (connection?: Connection): Promise<Connection> => {
  if (connection) {
    return connection;
  }

  // Check if we have a valid cached connection
  const now = Date.now();
  if (cachedConnection && (now - lastConnectionTime) < CONNECTION_TIMEOUT) {
    return cachedConnection;
  }

  try {
    // Get the Helius API key from the server config
    const heliusApiKey = await getHeliusApiKey();
    
    console.log('Creating new Helius RPC connection...');
    const heliusMainnetRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    
    // Create new connection with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const newConnection = new Connection(heliusMainnetRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 60000, // 60 seconds
          wsEndpoint: `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        });

        // Validate the connection by getting the version
        await newConnection.getVersion();
        
        // Update cache
        cachedConnection = newConnection;
        lastConnectionTime = now;
        
        return newConnection;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        console.warn(`Connection attempt ${retryCount} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    throw new Error('Failed to create connection after maximum retries');
  } catch (error) {
    console.error('Failed to create Helius RPC connection:', error);
    // Clear cache on error
    cachedConnection = null;
    lastConnectionTime = 0;
    throw new Error(`Failed to create Helius RPC connection: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Add a function to reset the connection cache if needed
export const resetConnection = (): void => {
  cachedConnection = null;
  lastConnectionTime = 0;
  console.log('Connection cache reset');
};

// Cache the API base URL to avoid multiple lookups
let cachedApiBaseUrl: string | null = null;

// Reset the cached API base URL to force a new lookup
export const resetApiBaseUrlCache = (): void => {
  cachedApiBaseUrl = null;
  console.log('API base URL cache reset');
};

export const getApiBaseUrl = async (): Promise<string> => {
  // In development, use relative URLs that work with Vite proxy
  if (process.env.NODE_ENV === 'development') {
    return '';  // Empty string for relative URLs
  }
  
  // In production, use the configured API URL
  return process.env.REACT_APP_API_URL || '';
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
    console.log(`Notifying server about transaction status: ${status} for NFT: ${nftAddress}`);
    const apiBaseUrl = await getApiBaseUrl();
    
    // Use the correct endpoint based on the status
    const endpoint = status === 'Unlisted' 
      ? `${apiBaseUrl}/api/market/update-listing-status` 
      : `${apiBaseUrl}/api/market/confirm-purchase`;
    
    // Prepare the request body based on the endpoint
    const body = status === 'Unlisted'
      ? JSON.stringify({ nftAddress, status })
      : JSON.stringify({ nftAddress, signature, status });
    
    console.log(`Sending notification to ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    if (!response.ok) {
      console.error(`Failed to notify server: ${response.status} ${response.statusText}`);
      return false;
    }
    
    console.log(`Successfully notified server about ${status} status for NFT: ${nftAddress}`);
    return true;
  } catch (error) {
    console.error('Error notifying server about transaction:', error);
    return false;
  }
};

/**
 * Properly formats a transaction for Phantom wallet to avoid base58 encoding issues
 * @param transaction The transaction to format
 * @returns A base58 encoded string that Phantom can understand
 */
const formatTransactionForPhantom = (transaction: Transaction): string => {
  try {
    // Serialize the transaction to the wire format
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Convert to base58 for Phantom
    const base58Transaction = bs58.encode(serializedTransaction);
    console.log('Transaction successfully encoded to base58 for Phantom');
    return base58Transaction;
  } catch (error) {
    console.error('Error formatting transaction for Phantom:', error);
    throw error;
  }
};

// Transaction Handling Functions
const handlePhantomTransaction = async (
  wallet: WalletInterface,
  transaction: Transaction,
  connection: Connection,
  nftAddress: string,
  ownerAddress: string,
  breakdown?: any,
  nftName?: string
): Promise<string | null> => {
  try {
    // Get a fresh blockhash with a longer validity period
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey!;

    // Use Phantom's API to sign and send
    console.log('Sending transaction to Phantom for signing...');
    const phantomProvider = (window as any).solana;
    
    // Use the new helper function to format the transaction
    const base58Transaction = formatTransactionForPhantom(transaction);
    
    // Sign and send with proper error handling
    try {
      const signature = await phantomProvider.request({
        method: 'signAndSendTransaction',
        params: {
          message: base58Transaction,
        },
      });
      
      // Extract the signature string from the response object
      const signatureString = typeof signature === 'object' && signature.signature 
        ? signature.signature 
        : signature;
      
      console.log('Transaction signed and sent via Phantom, signature:', signature);
      console.log('Using signature string for confirmation:', signatureString);
      
      // Wait for confirmation with retry logic
      let confirmed = false;
      const maxConfirmRetries = 5;
      let retryCount = 0;
      
      while (!confirmed && retryCount < maxConfirmRetries) {
        try {
          console.log(`Confirmation attempt ${retryCount + 1}/${maxConfirmRetries}`);
          
          // Get the confirmation with extended timeout
          const confirmation = await Promise.race([
            connection.confirmTransaction(
              {
                signature: signatureString,
                blockhash,
                lastValidBlockHeight,
              },
              'confirmed'
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
            )
          ]);
          
          console.log('Transaction confirmed:', confirmation);
          confirmed = true;
          
          // If we have breakdown and nftName, call the success callback
          if (breakdown && nftName) {
            callPurchaseSuccessPopupCallback(nftName, breakdown, signatureString);
          }
          
          return signatureString;
        } catch (error) {
          console.warn(`Confirmation attempt ${retryCount + 1} failed:`, error);
          retryCount++;
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!confirmed) {
        console.error('Failed to confirm transaction after multiple attempts');
        return null;
      }
      
      return signatureString;
    } catch (error) {
      console.error('Error with Phantom transaction:', error);
      return null;
    }
  } catch (error) {
    console.error('Error in handlePhantomTransaction:', error);
    return null;
  }
};

const handleStandardTransaction = async (
  wallet: WalletInterface,
  transaction: Transaction,
  connection: Connection,
  nftAddress: string,
  ownerAddress: string,
  breakdown?: any,
  nftName?: string
): Promise<string | null> => {
  try {
    if (!wallet.signTransaction) {
      console.error('Wallet does not support signTransaction method');
      return null;
    }

    // Get a fresh blockhash with a longer validity period
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey!;
    
    // Sign the transaction
    console.log('Signing transaction with standard wallet adapter...');
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // Send the transaction
    console.log('Sending signed transaction...');
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5
      }
    );
    
    console.log('Transaction sent, signature:', signature);
    
    // Wait for confirmation with retry logic
    let confirmed = false;
    const maxConfirmRetries = 5;
    let retryCount = 0;
    
    while (!confirmed && retryCount < maxConfirmRetries) {
      try {
        console.log(`Confirmation attempt ${retryCount + 1}/${maxConfirmRetries}`);
        
        // Get the confirmation with extended timeout
        const confirmation = await Promise.race([
          connection.confirmTransaction(
            {
              signature,
              blockhash,
              lastValidBlockHeight
            },
            'confirmed'
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
          )
        ]);
        
        console.log('Transaction confirmed:', confirmation);
        confirmed = true;
        
        // If we have breakdown and nftName, call the success callback
        if (breakdown && nftName) {
          callPurchaseSuccessPopupCallback(nftName, breakdown, signature);
        }
        
        return signature;
      } catch (error) {
        console.warn(`Confirmation attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!confirmed) {
      console.error('Failed to confirm transaction after multiple attempts');
      return null;
    }
    
    return signature;
  } catch (error) {
    console.error('Error in handleStandardTransaction:', error);
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
    
    connection = connection || await ensureConnection();
    const nftAddress = typeof nft === 'string' ? nft : nft.mint;
    const apiBaseUrl = await getApiBaseUrl();
    
    const response = await fetch(`${apiBaseUrl}/api/market/listings`, {
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
        console.log('Deserializing transaction from server response');
        
        // Create a new transaction from the base64 data
        const transactionBuffer = Buffer.from(responseData.transaction, 'base64');
        const transaction = Transaction.from(transactionBuffer);
        
        console.log('Transaction deserialized successfully');
        console.log('Transaction has', transaction.instructions.length, 'instructions');
        
        // Try Phantom first if it's available
        if ((window as any).solana?.isPhantom) {
          console.log('Attempting to use Phantom wallet');
          const phantomSignature = await handlePhantomTransaction(
            wallet,
            transaction,
            connection,
            nftAddress,
            ownerAddress,
            responseData.data && responseData.data.breakdown,
            responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
          );
          
          if (phantomSignature) {
            console.log('Transaction signed and sent successfully with Phantom');
            setTransactionConfirmed(true);
            return true;
          }
        }
        
        // Fall back to standard approach
        console.log('Attempting to use standard wallet adapter');
        const standardSignature = await handleStandardTransaction(
          wallet,
          transaction,
          connection,
          nftAddress,
          ownerAddress,
          responseData.data && responseData.data.breakdown,
          responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
        );
        
        if (standardSignature) {
          console.log('Transaction signed and sent successfully with standard approach');
          setTransactionConfirmed(true);
          return true;
        }
        
        console.error('Failed to sign and send transaction with any method');
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
  wallet?: WalletContextState
): Promise<boolean> => {
  let retryCount = 0;
  const maxRetries = 2;
  
  const attemptUnlist = async (): Promise<boolean> => {
    try {
      const nftAddress = typeof nft === 'string' ? nft : nft.mint;
      
      // Use our consistent connection creator
      connection = connection || await ensureConnection();
      console.log('Using connection with URL:', (connection as any)._rpcEndpoint);
      
      const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
      if (ownerAddress === ROYALTY_RECEIVER_ADDRESS) {
        const isActuallySeller = await isOriginalSeller(nftAddress, ownerAddress);
        if (!isActuallySeller) {
          return false;
        }
      }
      
      // Get the dynamic API base URL
      const apiBaseUrl = await getApiBaseUrl();
      console.log(`Making unlist request to ${apiBaseUrl}/api/market/unlist`);
      
      const response = await fetch(`${apiBaseUrl}/api/market/unlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nftAddress,
          ownerAddress,
        }),
      });

      if (!response.ok) {
        console.error('Error response from unlist endpoint:', await response.text());
        
        // If we get a 404 or connection error, retry with incrementing ports
        if (response.status === 404 || response.status === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying unlist (attempt ${retryCount})`);
            return await attemptUnlist();
          }
        }
        
        return false;
      }
      
      const responseData = await response.json();
      
      if (!responseData.success) {
        console.error('Server reported failure:', responseData.message);
        return false;
      }
      
      if (responseData.action === 'unlist' && wallet) {
        try {
          // Check if we received escrow account information (for actual transfer)
          if (responseData.escrowAccount && responseData.accounts) {
            console.log('Received escrow account information, preparing transfer transaction');
            
            // Extract account information
            const { escrowAccount, accounts, nftInEscrow } = responseData;
            
            // If the NFT is not in escrow, no need to transfer
            if (!nftInEscrow) {
              console.log('NFT is not in escrow, no transfer needed. Updating listing status only.');
              await notifyServer(nftAddress, 'no-signature', 'Unlisted');
              return true;
            }
            
            // Create a new transaction for the transfer
            const transaction = new Transaction();
            
            // Import necessary classes for token transfer
            const { 
              getAssociatedTokenAddress, 
              createAssociatedTokenAccountInstruction,
              createTransferInstruction,
              TOKEN_PROGRAM_ID
            } = await import('@solana/spl-token');
            
            // Set up accounts
            const mintPubkey = new PublicKey(accounts.mint);
            const ownerPubkey = new PublicKey(accounts.ownerAddress);
            const escrowPubkey = new PublicKey(escrowAccount.publicKey);
            const escrowTokenAccount = new PublicKey(accounts.escrowTokenAccount);
            const ownerTokenAccount = new PublicKey(accounts.ownerTokenAccount);
            
            // Reconstruct escrow keypair
            const escrowKeypair = Keypair.fromSecretKey(
              Buffer.from(escrowAccount.secretKey, 'base64')
            );
            
            // Check if owner token account exists, if not create it
            try {
              const ownerTokenAccountInfo = await connection.getAccountInfo(ownerTokenAccount);
              if (!ownerTokenAccountInfo) {
                console.log('Owner token account does not exist, adding instruction to create it...');
                
                const createOwnerTokenAccountInstruction = createAssociatedTokenAccountInstruction(
                  escrowPubkey, // payer
                  ownerTokenAccount, // token account to create
                  ownerPubkey, // owner
                  mintPubkey // mint
                );
                
                transaction.add(createOwnerTokenAccountInstruction);
              }
            } catch (error) {
              console.error('Error checking owner token account:', error);
            }
            
            // Add instruction to transfer the NFT from escrow back to owner
            console.log('Adding transfer instruction...');
            console.log(`- Source: ${escrowTokenAccount.toString()}`);
            console.log(`- Destination: ${ownerTokenAccount.toString()}`);
            console.log(`- Owner (Escrow): ${escrowPubkey.toString()}`);
            
            const transferInstruction = createTransferInstruction(
              escrowTokenAccount, // source
              ownerTokenAccount, // destination
              escrowPubkey, // owner (escrow)
              1 // amount (NFTs have amount 1)
            );
            
            transaction.add(transferInstruction);
            
            // Set fee payer to escrow account
            transaction.feePayer = escrowPubkey;
            
            // Get a recent blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            
            // Sign the transaction with the escrow keypair
            transaction.partialSign(escrowKeypair);
            
            console.log('Transaction created and signed by escrow account');
            console.log('Transaction has', transaction.instructions.length, 'instructions');
            
            // Send the transaction directly from the client with improved options
            const signature = await connection.sendRawTransaction(
              transaction.serialize(),
              {
                skipPreflight: false,
                preflightCommitment: 'confirmed' as Commitment,
                maxRetries: 5
              }
            );
            
            console.log('Transaction sent, signature:', signature);
            
            // Wait for confirmation with retry logic
            let confirmed = false;
            const maxConfirmRetries = 5;
            let retryCount = 0;
            
            while (!confirmed && retryCount < maxConfirmRetries) {
              try {
                console.log(`Confirmation attempt ${retryCount + 1}/${maxConfirmRetries}`);
                
                // Get the confirmation with extended timeout
                const confirmation = await Promise.race([
                  connection.confirmTransaction(
                    {
                      signature,
                      blockhash,
                      lastValidBlockHeight
                    },
                    'confirmed'
                  ),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
                  )
                ]);
                
                if (confirmation && (confirmation as any).value && (confirmation as any).value.err) {
                  console.error('Confirmation error:', (confirmation as any).value.err);
                  retryCount++;
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                  continue;
                }
                
                confirmed = true;
                console.log('Transaction confirmed successfully!');
                await notifyServer(nftAddress, signature, 'Unlisted');
                return true;
              } catch (confirmError) {
                console.error(`Confirmation attempt ${retryCount + 1} failed:`, confirmError);
                
                // Check if the transaction is actually confirmed despite the error
                try {
                  const status = await connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                  });
                  
                  if (status && 
                      status.value && 
                      (status.value.confirmationStatus === 'confirmed' || 
                       status.value.confirmationStatus === 'finalized')) {
                    console.log('Transaction confirmed despite error!');
                    confirmed = true;
                    await notifyServer(nftAddress, signature, 'Unlisted');
                    return true;
                  }
                } catch (statusError) {
                  console.warn('Error checking signature status:', statusError);
                }
                
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
              }
            }
            
            if (!confirmed) {
              console.error('Failed to confirm transaction after multiple attempts');
              return false;
            }
          }
          // Handle the simple memo-only transaction case (backward compatibility)
          else {
            console.log('Creating transaction locally with data from server');
            
            // Create a new transaction locally
            const transaction = new Transaction();
            
            // Add a memo instruction with the provided data
            transaction.add(
              new TransactionInstruction({
                keys: [
                  {
                    pubkey: new PublicKey(ownerAddress),
                    isSigner: true,
                    isWritable: true,
                  }
                ],
                programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                data: Buffer.from(responseData.memo || 'Unlist NFT', 'utf-8'),
              })
            );
            
            console.log('Transaction created successfully');
            console.log('Transaction has', transaction.instructions.length, 'instructions');
            
            // Try Phantom first if it's available
            if ((window as any).solana?.isPhantom) {
              console.log('Attempting to use Phantom wallet');
              const phantomSignature = await handlePhantomTransaction(
                wallet,
                transaction,
                connection,
                nftAddress,
                ownerAddress,
                responseData.data && responseData.data.breakdown,
                responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
              );
              
              if (phantomSignature) {
                console.log('Transaction signed and sent successfully with Phantom');
                await notifyServer(nftAddress, phantomSignature, 'Unlisted');
                console.log('Notified server about successful unlist transaction');
                return true;
              }
            }
            
            // Fall back to standard approach
            console.log('Attempting to use standard wallet adapter');
            const standardSignature = await handleStandardTransaction(
              wallet,
              transaction,
              connection,
              nftAddress,
              ownerAddress,
              responseData.data && responseData.data.breakdown,
              responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
            );
            
            if (standardSignature) {
              console.log('Transaction signed and sent successfully with standard approach');
              await notifyServer(nftAddress, standardSignature, 'Unlisted');
              console.log('Notified server about successful unlist transaction');
              return true;
            }
            
            console.error('Failed to sign and send transaction with any method');
            return false;
          }
        } catch (error) {
          console.error('Error processing transaction:', error);
          return false;
        }
      } else if (responseData.transaction && wallet) {
        // Legacy handling for serialized transaction (keeping for backward compatibility)
        try {
          console.log('LEGACY: Deserializing transaction from server response');
          
          // Create a new transaction from the base64 data
          const transactionBuffer = Buffer.from(responseData.transaction, 'base64');
          const transaction = Transaction.from(transactionBuffer);
          
          console.log('Transaction deserialized successfully');
          console.log('Transaction has', transaction.instructions.length, 'instructions');
          
          // Try Phantom first if it's available
          if ((window as any).solana?.isPhantom) {
            console.log('Attempting to use Phantom wallet');
            const phantomSignature = await handlePhantomTransaction(
              wallet,
              transaction,
              connection,
              nftAddress,
              ownerAddress,
              responseData.data && responseData.data.breakdown,
              responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
            );
            
            if (phantomSignature) {
              console.log('Transaction signed and sent successfully with Phantom');
              // Notify the server to update the listing status to Unlisted
              await notifyServer(nftAddress, phantomSignature, 'Unlisted');
              console.log('Notified server about successful unlist transaction');
              return true;
            }
          }
          
          // Fall back to standard approach
          console.log('Attempting to use standard wallet adapter');
          const standardSignature = await handleStandardTransaction(
            wallet,
            transaction,
            connection,
            nftAddress,
            ownerAddress,
            responseData.data && responseData.data.breakdown,
            responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
          );
          
          if (standardSignature) {
            console.log('Transaction signed and sent successfully with standard approach');
            // Notify the server to update the listing status to Unlisted
            await notifyServer(nftAddress, standardSignature, 'Unlisted');
            console.log('Notified server about successful unlist transaction');
            return true;
          }
          
          console.error('Failed to sign and send transaction with any method');
          return false;
        } catch (deserializeError) {
          console.error('Error deserializing transaction:', deserializeError);
          return false;
        }
      }
      
      console.error('No usable transaction data in server response');
      return false;
    } catch (error) {
      console.error('Error in attemptUnlist:', error);
      
      // If there's a connection error, retry
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`Retrying unlist (attempt ${retryCount})`);
        return await attemptUnlist();
      }
      
      return false;
    }
  };
  
  return attemptUnlist();
};

export const cleanupBurnedNFTListings = async (
  nftAddresses: string[]
): Promise<boolean> => {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/market/cleanup-burned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nftAddresses })
    });
    
    if (!response.ok) {
      console.error('Failed to cleanup burned NFT listings:', response.statusText);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error cleaning up burned NFT listings:', error);
    return false;
  }
};

// Additional exports for Market.tsx compatibility
export const purchaseNFT = async (
  nft: NFT | string,
  buyerAddress: string,
  buyerWallet: WalletInterface,
  connection?: Connection
): Promise<boolean> => {
  // Configure connection with optimized settings
  // Ensure connection is always defined to fix TypeScript errors
  const safeConnection = connection || new Connection(
    process.env.REACT_APP_SOLANA_RPC_HOST || 'https://api.mainnet-beta.solana.com', 
    {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000, // 60 seconds
      disableRetryOnRateLimit: false,
      fetchMiddleware: undefined,
    }
  );
  
  // Extract NFT address
  const nftAddress = typeof nft === 'string' ? nft : nft.mint;
  const price = typeof nft === 'string' ? 0 : (nft.price || 0);
  
  let retryCount = 0;
  const maxRetries = 3; // Increase max retries to 3
  
  // Define attemptPurchase first before using it
  const attemptPurchase = async (): Promise<boolean> => {
    try {
      const apiBaseUrl = await getApiBaseUrl();
      console.log(`Making purchase request to ${apiBaseUrl}/api/market/buy`);
      
      // Extract the NFT address and price
      const nftAddress = typeof nft === 'string' ? nft : nft.mint;
      const nftPrice = typeof nft === 'string' ? null : nft.price;
      
      const response = await fetch(`${apiBaseUrl}/api/market/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nftAddress,
          buyerAddress,
          price: nftPrice
        })
      });
      
      if (!response.ok) {
        console.error(`Server returned ${response.status}: ${response.statusText}`);
        
        // If we get a 404 or connection error, the server might be running on a different port
        if (response.status === 404 || response.status === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            resetApiBaseUrlCache();
            console.log(`Retrying purchase with new port detection (attempt ${retryCount})`);
            return await attemptPurchase();
          }
        }
        
        return false;
      }
      
      const responseData = await response.json();
      
      if (!responseData.success) {
        console.error('Server reported failure:', responseData.message);
        return false;
      }
      
      // Handle actual NFT transfer if we received escrow account information
      if (responseData.action === 'purchase' && responseData.escrowAccount && responseData.accounts) {
        try {
          console.log('Received escrow account information, preparing transfer transaction');
          
          // Extract account information
          const { escrowAccount, accounts, nftInEscrow } = responseData;
          
          // If the NFT is not in escrow, no transfer is possible
          if (!nftInEscrow) {
            console.error('NFT is not in escrow, cannot complete purchase');
            return false;
          }
          
          // Check if we have price breakdown information for royalties
          if (responseData.data && responseData.data.breakdown) {
            const { totalPrice, royaltyPercentage, royaltyAmount, sellerAmount, creatorAddress } = responseData.data.breakdown;
            console.log('Price breakdown received from server:');
            console.log(`- Total price: ${totalPrice} SOL`);
            console.log(`- Royalty (${royaltyPercentage}%): ${royaltyAmount} SOL`);
            console.log(`- Seller amount: ${sellerAmount} SOL`);
            console.log(`- Creator address: ${creatorAddress}`);
          }
          
          // Create a new transaction for the transfer
          const transaction = new Transaction();
          
          // Import necessary classes for token transfer
          const { 
            getAssociatedTokenAddress, 
            createAssociatedTokenAccountInstruction,
            createTransferInstruction,
            TOKEN_PROGRAM_ID
          } = await import('@solana/spl-token');
          
          // Set up accounts
          const mintPubkey = new PublicKey(accounts.mint);
          const buyerPubkey = new PublicKey(accounts.buyerAddress);
          const escrowPubkey = new PublicKey(escrowAccount.publicKey);
          const escrowTokenAccount = new PublicKey(accounts.escrowTokenAccount);
          const buyerTokenAccount = new PublicKey(accounts.buyerTokenAccount);
          
          // Reconstruct escrow keypair
          const escrowKeypair = Keypair.fromSecretKey(
            Buffer.from(escrowAccount.secretKey, 'base64')
          );
          
          // Check if buyer token account exists, if not create it
          try {
            const buyerTokenAccountInfo = await safeConnection.getAccountInfo(buyerTokenAccount);
            if (!buyerTokenAccountInfo) {
              console.log('Buyer token account does not exist, adding instruction to create it...');
              
              const createBuyerTokenAccountInstruction = createAssociatedTokenAccountInstruction(
                escrowPubkey, // payer
                buyerTokenAccount, // token account to create
                buyerPubkey, // owner
                mintPubkey // mint
              );
              
              transaction.add(createBuyerTokenAccountInstruction);
            }
          } catch (error) {
            console.error('Error checking buyer token account:', error);
          }
          
          // Add instruction to transfer the NFT from escrow to buyer
          console.log('Adding transfer instruction...');
          console.log(`- Source: ${escrowTokenAccount.toString()}`);
          console.log(`- Destination: ${buyerTokenAccount.toString()}`);
          console.log(`- Owner (Escrow): ${escrowPubkey.toString()}`);
          
          const transferInstruction = createTransferInstruction(
            escrowTokenAccount, // source
            buyerTokenAccount, // destination
            escrowPubkey, // owner (escrow)
            1 // amount (NFTs have amount 1)
          );
          
          transaction.add(transferInstruction);
          
          // Set fee payer to escrow account
          transaction.feePayer = escrowPubkey;
          
          // Get a recent blockhash
          const { blockhash, lastValidBlockHeight } = await safeConnection.getLatestBlockhash('finalized');
          transaction.recentBlockhash = blockhash;
          
          // Sign the transaction with the escrow keypair
          transaction.partialSign(escrowKeypair);
          
          console.log('Transaction created and signed by escrow account');
          console.log('Transaction has', transaction.instructions.length, 'instructions');
          
          // Send the transaction with improved options
          console.log('Sending transaction...');
          
          // Try Phantom first if it's available
          if ((window as any).solana?.isPhantom) {
            console.log('Attempting to use Phantom wallet');
            
            try {
              // Use our helper function to format the transaction for Phantom
              const base58Transaction = formatTransactionForPhantom(transaction);
              
              const phantomProvider = (window as any).solana;
              const phantomSignature = await phantomProvider.request({
                method: 'signAndSendTransaction',
                params: {
                  message: base58Transaction,
                },
              });
              
              // Extract the signature string from the response object
              const signatureString = typeof phantomSignature === 'object' && phantomSignature.signature 
                ? phantomSignature.signature 
                : phantomSignature;
              
              console.log('Transaction signed and sent via Phantom, signature:', signatureString);
              
              // Wait for confirmation with retry logic
              let confirmed = false;
              const maxConfirmRetries = 5;
              let retryCount = 0;
              
              while (!confirmed && retryCount < maxConfirmRetries) {
                try {
                  console.log(`Confirmation attempt ${retryCount + 1}/${maxConfirmRetries}`);
                  
                  // Get the confirmation with extended timeout
                  const confirmation = await Promise.race([
                    safeConnection.confirmTransaction(
                      {
                        signature: signatureString,
                        blockhash,
                        lastValidBlockHeight
                      },
                      'confirmed'
                    ),
                    new Promise((_, reject) => 
                      setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
                    )
                  ]);
                  
                  if (confirmation && (confirmation as any).value && (confirmation as any).value.err) {
                    console.error('Confirmation error:', (confirmation as any).value.err);
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                    continue;
                  }
                  
                  confirmed = true;
                  console.log('Transaction confirmed successfully!');
                  await notifyServer(nftAddress, signatureString, 'Sold');
                  return true;
                } catch (confirmError) {
                  console.error(`Confirmation attempt ${retryCount + 1} failed:`, confirmError);
                  retryCount++;
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                }
              }
              
              if (!confirmed) {
                console.error('Failed to confirm transaction after multiple attempts');
                return false;
              }
              
              return true;
            } catch (phantomError: any) {
              console.error('Error with Phantom wallet:', phantomError);
              // Continue to standard approach if Phantom fails
            }
          }
          
          // Fall back to standard approach
          console.log('Using standard transaction approach');
          const standardSignature = await handleStandardTransaction(
            buyerWallet,
            transaction,
            safeConnection,
            nftAddress,
            buyerWallet.publicKey?.toString() || '',
            responseData.data && responseData.data.breakdown,
            responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
          );
          
          if (standardSignature) {
            console.log('Standard transaction successful, signature:', standardSignature);
            
            // Store the payment breakdown for the success popup
            if (responseData.data && responseData.data.breakdown) {
              const nftName = typeof nft === 'string' ? nftAddress : (nft.name || 'NFT');
              
              // Use the existing callback function
              if (callPurchaseSuccessPopupCallback) {
                callPurchaseSuccessPopupCallback(nftName, responseData.data.breakdown, standardSignature);
              }
            }
            
            await notifyServer(nftAddress, standardSignature, 'Sold');
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Error handling purchase transaction:', error);
          return false;
        }
      }
      // Handle the legacy memo-transaction case for backward compatibility
      else if (responseData.transaction && buyerWallet) {
        try {
          console.log('Deserializing transaction from server response');
          
          // Create a new transaction from the base64 data
          const transactionBuffer = Buffer.from(responseData.transaction, 'base64');
          const transaction = Transaction.from(transactionBuffer);
          
          console.log('Transaction deserialized successfully');
          console.log('Transaction has', transaction.instructions.length, 'instructions');
          
          // Try Phantom first if it's available
          if ((window as any).solana?.isPhantom) {
            console.log('Attempting to use Phantom wallet');
            const phantomSignature = await handlePhantomTransaction(
              buyerWallet,
              transaction,
              safeConnection,
              nftAddress,
              buyerWallet.publicKey?.toString() || '',
              responseData.data && responseData.data.breakdown,
              responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
            );
            
            if (phantomSignature) {
              console.log('Phantom transaction successful, signature:', phantomSignature);
              
              // Store the payment breakdown for the success popup
              if (responseData.data && responseData.data.breakdown) {
                const nftName = typeof nft === 'string' ? nftAddress : (nft.name || 'NFT');
                
                // Use the existing callback function
                if (callPurchaseSuccessPopupCallback) {
                  callPurchaseSuccessPopupCallback(nftName, responseData.data.breakdown, phantomSignature);
                }
              }
              
              await notifyServer(nftAddress, phantomSignature, 'Sold');
              return true;
            }
          }
          
          // Fall back to standard approach
          console.log('Attempting to use standard wallet adapter');
          const standardSignature = await handleStandardTransaction(
            buyerWallet,
            transaction,
            safeConnection,
            nftAddress,
            buyerWallet.publicKey?.toString() || '',
            responseData.data && responseData.data.breakdown,
            responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
          );
          
          if (standardSignature) {
            console.log('Standard transaction successful, signature:', standardSignature);
            
            // Store the payment breakdown for the success popup
            if (responseData.data && responseData.data.breakdown) {
              const nftName = typeof nft === 'string' ? nftAddress : (nft.name || 'NFT');
              
              // Use the existing callback function
              if (callPurchaseSuccessPopupCallback) {
                callPurchaseSuccessPopupCallback(nftName, responseData.data.breakdown, standardSignature);
              }
            }
            
            await notifyServer(nftAddress, standardSignature, 'Sold');
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Transaction failed:', error);
          return false;
        }
      } else {
        // Simple memo transaction case
        console.log('Creating simple memo transaction for purchase');
        
        // Create a new transaction locally
        const transaction = new Transaction();
        
        // Add a memo instruction with the purchase data
        transaction.add(
          new TransactionInstruction({
            keys: [
              {
                pubkey: buyerWallet.publicKey!,
                isSigner: true,
                isWritable: true,
              }
            ],
            programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from(`Purchase NFT: ${nftAddress}`, 'utf-8'),
          })
        );
        
        // Try Phantom first if it's available
        if ((window as any).solana?.isPhantom) {
          console.log('Attempting to use Phantom wallet');
          const phantomSignature = await handlePhantomTransaction(
            buyerWallet,
            transaction,
            safeConnection,
            nftAddress,
            buyerWallet.publicKey?.toString() || '',
            responseData.data && responseData.data.breakdown,
            responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
          );
          
          if (phantomSignature) {
            await notifyServer(nftAddress, phantomSignature, 'Sold');
            return true;
          }
        }
        
        // Fall back to standard approach
        console.log('Attempting to use standard wallet adapter');
        const standardSignature = await handleStandardTransaction(
          buyerWallet,
          transaction,
          safeConnection,
          nftAddress,
          buyerWallet.publicKey?.toString() || '',
          responseData.data && responseData.data.breakdown,
          responseData.data && responseData.data.breakdown ? (nft as NFT).name : undefined
        );
        
        if (standardSignature) {
          await notifyServer(nftAddress, standardSignature, 'Sold');
          return true;
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error in purchaseNFT:', error);
      
      // If there's a connection error, reset the cache to try a different port
      if (retryCount < maxRetries) {
        retryCount++;
        resetApiBaseUrlCache();
        console.log(`Retrying purchase with new port detection (attempt ${retryCount})`);
        return await attemptPurchase();
      }
      
      return false;
    }
  };
  
  return attemptPurchase();
};

export const fetchMetaplexListingData = async <T extends NFT>(
  nfts: T[],
  connection?: Connection
): Promise<T[]> => {
  let retryCount = 0;
  const maxRetries = 3;
  
  const attemptFetch = async (): Promise<T[]> => {
    try {
      const apiBaseUrl = await getApiBaseUrl();
      console.log(`Attempting to fetch listings from /api/market/listings (attempt ${retryCount + 1})`);
      const nftAddresses = nfts.map(nft => nft.mint);
      
      const response = await fetch(`/api/market/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nftAddresses }),
        // Add a timeout to avoid hanging
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        console.error(`Error fetching listing data: ${response.statusText} (status: ${response.status})`);
        
        // If we get a 404 or connection error, retry
        if ((response.status === 404 || response.status === 0) && retryCount < maxRetries) {
          retryCount++;
          resetApiBaseUrlCache(); // Reset the cached URL to force a new lookup
          console.log(`Retrying (attempt ${retryCount})`);
          
          // Add a small delay before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
          return await attemptFetch();
        }
        
        // If all retries failed, return empty listings
        return nfts.map(nft => ({
          ...nft,
          listing: null,
          listed: false,
          price: null
        }));
      }
      
      const listings = await response.json();
      
      // Map the listings to the NFTs
      return nfts.map(nft => {
        const listing = listings[nft.mint];
        return {
          ...nft,
          listing: listing || null,
          listed: !!listing,
          price: listing?.price || null
        };
      });
    } catch (error) {
      console.error('Error fetching listing data:', error);
      
      // If we have retries left, try again
      if (retryCount < maxRetries) {
        retryCount++;
        resetApiBaseUrlCache();
        console.log(`Retrying after error (attempt ${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await attemptFetch();
      }
      
      // If all retries failed, return empty listings
      return nfts.map(nft => ({
        ...nft,
        listing: null,
        listed: false,
        price: null
      }));
    }
  };
  
  return await attemptFetch();
};

export const initializeMarketplace = async (): Promise<void> => {
  try {
    // Initialize Google Sheets connection
    console.log('Initializing marketplace with Google Sheets');
    
    // Test Google Sheets connection by trying to read from the collections sheet
    const sheetsClient = await createSheetsClient();
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: `${GOOGLE_SHEETS_CONFIG.sheets.collections}!A1:A1`
    });
    
    console.log('Marketplace initialized successfully with Google Sheets');
  } catch (error) {
    console.error('Error initializing marketplace:', error);
    throw error; // Re-throw to allow caller to handle
  }
};

// Add a callback for purchase success popup
let purchaseSuccessPopupCallback: ((nftName: string, breakdown: any, signature: string) => void) | null = null;

/**
 * Sets a callback function to be called when a purchase is successful
 * @param callback The callback function to call when a purchase is successful
 */
export const setPurchaseSuccessPopupCallback = (
  callback: ((nftName: string, breakdown: any, signature: string) => void) | null
): void => {
  purchaseSuccessPopupCallback = callback;
};

// Export types
export type { 
  TransactionOptions, 
  TransactionResponse, 
  NFTWithObjectOwner, 
  StoredListing,
  WalletInterface 
};

// Add this function near the top of the file
// Function to create a consistent connection object
export const createConsistentConnection = (): Connection => {
  // Use mainnet as the default cluster
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d';
  console.log('Creating connection with RPC URL:', rpcUrl);
  
  // Use a consistent commitment level
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60 seconds timeout
    disableRetryOnRateLimit: false
  });
}; 