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
  return API_BASE_URL;
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

// Retain only helper functions that might be used elsewhere
export const formatPrice = (solPrice: number, solUsdPrice: number): string => {
  return `${solPrice.toFixed(3)} SOL${solUsdPrice ? ` ($${(solPrice * solUsdPrice).toFixed(2)})` : ''}`;
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

// Export empty function stubs if needed to prevent breaking code
export const listNFTForSale = async (): Promise<NFT | null> => {
  console.warn('Listing functionality has been removed');
  return null;
};

export const purchaseNFT = async (): Promise<NFT | null> => {
  console.warn('Purchase functionality has been removed');
  return null;
};

// Get connection with proper fallbacks
export const getConnection = () => {
  const endpoint = process.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  console.log(`Using Solana RPC endpoint: ${endpoint}`);
  return new Connection(endpoint);
}; 