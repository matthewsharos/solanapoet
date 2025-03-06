import { 
  PublicKey, 
  TransactionInstruction, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
  Transaction,
  Connection,
  Commitment
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createApproveInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { NFT } from '../types/nft';

// Replace with your actual marketplace program ID
const MARKETPLACE_PROGRAM_ID = new PublicKey(
  process.env.VITE_MARKETPLACE_PROGRAM_ID || 
  '11111111111111111111111111111111' // Default to System Program as fallback
);

// API base URL configuration - use relative URL for Vite proxy in development
const API_BASE_URL = process.env.NODE_ENV === 'development' ? '' : process.env.NEXT_PUBLIC_API_URL || '';

// Helper function to get API base URL with retry
const getApiBaseUrl = async (): Promise<string> => {
  // In development, use relative URLs that work with Vite proxy
  if (process.env.NODE_ENV === 'development') {
    return '';  // Empty string for relative URLs
  }
  
  // In production, use the configured API URL
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Gets the escrow account address for an NFT
 */
export const getEscrowAccount = async (
  nftMint: PublicKey,
  seller: PublicKey
): Promise<[PublicKey, number]> => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('escrow'),
      nftMint.toBuffer(),
      seller.toBuffer()
    ],
    MARKETPLACE_PROGRAM_ID
  );
};

/**
 * Creates instructions for listing an NFT
 */
export const createListingInstructions = async (
  connection: Connection,
  nftMint: PublicKey,
  price: number,
  seller: PublicKey
): Promise<TransactionInstruction[]> => {
  // Get the seller's token account for this NFT
  const sellerTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    seller
  );

  // Get the escrow token account
  const [escrowAccount, bump] = await getEscrowAccount(nftMint, seller);
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    escrowAccount,
    true // allowOwnerOffCurve
  );

  const instructions: TransactionInstruction[] = [];

  // Create escrow token account if it doesn't exist
  try {
    await connection.getAccountInfo(escrowTokenAccount);
  } catch {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        seller,
        escrowTokenAccount,
        escrowAccount,
        nftMint
      )
    );
  }

  // Approve the escrow to transfer the NFT
  instructions.push(
    createApproveInstruction(
      sellerTokenAccount,
      escrowAccount,
      seller,
      1
    )
  );

  // Create the listing instruction
  const listingIx = new TransactionInstruction({
    programId: MARKETPLACE_PROGRAM_ID,
    keys: [
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowAccount, isSigner: false, isWritable: true },
      { pubkey: nftMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([
      0, // Instruction index for 'list'
      ...new Uint8Array(new Float64Array([price]).buffer) // Price in SOL
    ])
  });

  instructions.push(listingIx);
  return instructions;
};

/**
 * Creates instructions for purchasing an NFT
 */
export const createPurchaseInstructions = async (
  connection: Connection,
  nftMint: PublicKey,
  price: number,
  buyer: PublicKey,
  seller: PublicKey
): Promise<TransactionInstruction[]> => {
  // Get the escrow account
  const [escrowAccount] = await getEscrowAccount(nftMint, seller);
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    escrowAccount,
    true
  );

  // Get or create the buyer's token account
  const buyerTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    buyer
  );

  const instructions: TransactionInstruction[] = [];

  // Create buyer's token account if it doesn't exist
  try {
    await connection.getAccountInfo(buyerTokenAccount);
  } catch {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        buyer,
        buyerTokenAccount,
        buyer,
        nftMint
      )
    );
  }

  // Create the purchase instruction
  const purchaseIx = new TransactionInstruction({
    programId: MARKETPLACE_PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowAccount, isSigner: false, isWritable: true },
      { pubkey: nftMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([
      1, // Instruction index for 'purchase'
      ...new Uint8Array(new Float64Array([price]).buffer) // Price in SOL
    ])
  });

  instructions.push(purchaseIx);
  return instructions;
};

/**
 * Formats a price in SOL with USD equivalent
 */
export const formatPrice = (solPrice: number, solUsdPrice: number): string => {
  const usdPrice = solPrice * solUsdPrice;
  return `${solPrice} SOL ($${usdPrice.toFixed(2)})`;
};

/**
 * Helper function to confirm a transaction with retries
 */
const confirmTransaction = async (
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
  maxRetries = 3
): Promise<void> => {
  let retries = maxRetries;
  
  while (retries > 0) {
    try {
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'finalized');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('Transaction confirmed:', signature);
      return;
    } catch (error) {
      console.log(`Confirmation attempt ${maxRetries - retries + 1} failed:`, error);
      retries--;
      
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries
    }
  }
};

/**
 * Creates and sends a transaction with retries
 */
const createAndSendTransaction = async (
  connection: Connection,
  wallet: WalletContextState,
  instructions: TransactionInstruction[],
  commitment: Commitment = 'finalized'
): Promise<{ signature: string; blockhash: string; lastValidBlockHeight: number }> => {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const transaction = new Transaction();
  instructions.forEach(ix => transaction.add(ix));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());

  console.log('Transaction sent:', signature);
  return { signature, blockhash, lastValidBlockHeight };
};

/**
 * Lists an NFT for sale
 */
export const listNFTForSale = async (
  nft: NFT,
  price: number,
  wallet: WalletContextState,
  connection?: Connection
): Promise<NFT> => {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  if (!connection) {
    // Create a default connection if none is provided
    connection = new Connection(
      process.env.SOLANA_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`,
      'confirmed'
    );
  }

  // Get the API base URL
  const apiBaseUrl = await getApiBaseUrl();
  console.log('Using API base URL:', apiBaseUrl);
  
  // Validate and ensure the mint address is a valid PublicKey
  let nftMintPubkey: string;
  try {
    // Validate that the mint is a proper base58 public key
    const mintPubkey = new PublicKey(nft.mint);
    nftMintPubkey = mintPubkey.toString();
    console.log('Valid NFT mint public key:', nftMintPubkey);
  } catch (error) {
    console.error('Invalid NFT mint address:', nft.mint, error);
    throw new Error(`Invalid NFT mint address: ${nft.mint}`);
  }
  
  // Log wallet information for debugging
  console.log('Wallet public key:', wallet.publicKey.toString());
  console.log('Price for listing:', price);
  
  try {
    // First check if we have a pending escrow creation
    const pendingEscrow = localStorage.getItem(`pending_escrow_${nft.mint}`);
    if (pendingEscrow) {
      console.log('Found pending escrow creation, checking status...');
      const escrowData = JSON.parse(pendingEscrow);
      
      try {
        // Check if the escrow account exists
        const escrowAccount = new PublicKey(escrowData.escrowTokenAccount);
        const accountInfo = await connection.getAccountInfo(escrowAccount);
        
        if (accountInfo) {
          console.log('Escrow account exists, proceeding with listing');
          localStorage.removeItem(`pending_escrow_${nft.mint}`);
        } else {
          console.log('Escrow account not found, retrying creation');
        }
      } catch (error) {
        console.log('Error checking escrow account:', error);
      }
    }

    // Prepare listing request
    console.log('Sending listing request to server...');

    // Use the exact parameter names expected by the server
    const requestData = {
      nftAddress: nft.mint,
      sellerAddress: wallet.publicKey.toString(),
      price: price
    };
    
    console.log('Request body:', JSON.stringify(requestData, null, 2));
    
    const listingResponse = await fetch(`${apiBaseUrl}/api/market/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    if (!listingResponse.ok) {
      const errorData = await listingResponse.json();
      console.error('Error listing NFT:', errorData);
      throw new Error(`Error listing NFT: ${JSON.stringify(errorData)}`);
    }

    const responseData = await listingResponse.json();
    console.log('Server response:', responseData);
    
    if (responseData.action === 'create_escrow_account') {
      console.log('Creating escrow account...');
      
      // Save pending escrow creation state
      localStorage.setItem(`pending_escrow_${nft.mint}`, JSON.stringify({
        escrowTokenAccount: responseData.escrowTokenAccount,
        timestamp: Date.now()
      }));

      // Create and send the escrow creation transaction
      const escrowTx = Transaction.from(Buffer.from(responseData.transaction, 'base64'));
      
      try {
        const { signature, blockhash, lastValidBlockHeight } = await createAndSendTransaction(
          connection,
          wallet,
          escrowTx.instructions,
          'finalized'
        );

        // Wait for confirmation with retries
        await confirmTransaction(
          connection,
          signature,
          blockhash,
          lastValidBlockHeight
        );

        console.log('Escrow account created successfully');
        
        // Clear pending state
        localStorage.removeItem(`pending_escrow_${nft.mint}`);

        // Now proceed with the actual listing
        return listNFTForSale(nft, price, wallet, connection);
      } catch (error) {
        console.error('Error creating escrow account:', error);
        throw error;
      }
    }
    
    // If we get here, the escrow account exists, process the listing transaction
    console.log('Processing listing transaction...');
    const listingTx = Transaction.from(Buffer.from(responseData.transaction, 'base64'));
    
    const { signature, blockhash, lastValidBlockHeight } = await createAndSendTransaction(
      connection,
      wallet,
      listingTx.instructions,
      'finalized'
    );

    // Wait for confirmation with retries
    await confirmTransaction(
      connection,
      signature,
      blockhash,
      lastValidBlockHeight
    );

    console.log('NFT listed successfully');
    return {
      ...nft,
      price,
      listed: true
    };
  } catch (error) {
    console.error('Error in listNFTForSale:', error);
    throw error;
  }
}; 