/**
 * NFT Listing Service
 * 
 * This service handles the creation of transactions for listing NFTs on the marketplace.
 * It implements a two-step process:
 * 1. Create an escrow token account owned by the marketplace
 * 2. Transfer the NFT to the escrow token account
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram
} from '@solana/web3.js';

import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Helius RPC URL from environment or use fallback
const heliusRpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d';

// Get marketplace wallet from environment or use fallback
const marketplaceWalletAddress = process.env.MARKETPLACE_WALLET || '11111111111111111111111111111111';

/**
 * Get a Solana connection
 * @returns {Connection} Solana connection
 */
function getConnection() {
  console.log('Creating Solana connection to mainnet');
  try {
    const connection = new Connection(heliusRpcUrl, 'confirmed');
    return connection;
  } catch (error) {
    console.error('Error creating Solana connection:', error);
    throw error;
  }
}

/**
 * Get the marketplace wallet public key
 * @returns {PublicKey} Marketplace wallet public key
 */
function getMarketplaceWallet() {
  console.log('Getting marketplace wallet');
  try {
    const marketplaceWalletPubkey = new PublicKey(marketplaceWalletAddress);
    console.log(`Using marketplace wallet: ${marketplaceWalletPubkey.toString()}`);
    return marketplaceWalletPubkey;
  } catch (error) {
    console.error('Invalid marketplace wallet public key:', error);
    throw error;
  }
}

/**
 * Create a transaction to create an escrow token account for an NFT
 * @param {string} nftMint - The mint address of the NFT
 * @param {string} sellerWallet - The wallet address of the seller
 * @param {Connection} [connection] - Optional Solana connection
 * @returns {Object} Transaction and escrow token account information
 */
export async function createEscrowTokenAccountTransaction(nftMint, sellerWallet, connection = null) {
  // Ensure connection is defined
  if (!connection) {
    console.log('No connection provided, creating a new connection');
    connection = getConnection();
  }

  console.log(`Creating escrow token account transaction for NFT: ${nftMint}, seller: ${sellerWallet}`);
  
  try {
    // Convert string public keys to PublicKey objects
    const mintPubkey = new PublicKey(nftMint);
    const sellerPubkey = new PublicKey(sellerWallet);
    const marketplacePubkey = getMarketplaceWallet();
    
    // Calculate the escrow token account address
    const escrowTokenAccount = PublicKey.findProgramAddressSync(
      [
        marketplacePubkey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
    
    console.log(`Escrow token account address: ${escrowTokenAccount.toString()}`);
    
    // Check if the escrow token account already exists
    const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccount);
    
    if (escrowAccountInfo) {
      console.log('Escrow token account already exists');
      return {
        exists: true,
        escrowTokenAccount: escrowTokenAccount.toString(),
        transaction: null
      };
    }
    
    // Create a transaction to create the escrow token account
    const transaction = new Transaction();
    
    // Add the instruction to create the associated token account
    const createATAInstruction = createAssociatedTokenAccountInstruction(
      sellerPubkey,            // payer
      escrowTokenAccount,      // ata
      marketplacePubkey,       // owner
      mintPubkey,              // mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    transaction.add(createATAInstruction);
    
    // Get recent blockhash for the transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sellerPubkey;
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    return {
      exists: false,
      escrowTokenAccount: escrowTokenAccount.toString(),
      transaction: serializedTransaction,
      blockhash,
      lastValidBlockHeight
    };
  } catch (error) {
    console.error('Error creating escrow token account transaction:', error);
    throw error;
  }
}

/**
 * Create a transaction to transfer an NFT to the escrow token account
 * @param {string} nftMint - The mint address of the NFT
 * @param {string} sellerWallet - The wallet address of the seller
 * @param {string} escrowTokenAccount - The escrow token account address
 * @param {Connection} [connection] - Optional Solana connection
 * @returns {Object} Transaction information
 */
export async function createNftTransferTransaction(nftMint, sellerWallet, escrowTokenAccount, connection = null) {
  // Ensure connection is defined
  if (!connection) {
    console.log('No connection provided, creating a new connection');
    connection = getConnection();
  }

  console.log(`Creating NFT transfer transaction for NFT: ${nftMint}, seller: ${sellerWallet}, escrow: ${escrowTokenAccount}`);
  
  try {
    // Convert string public keys to PublicKey objects
    const mintPubkey = new PublicKey(nftMint);
    const sellerPubkey = new PublicKey(sellerWallet);
    const escrowTokenAccountPubkey = new PublicKey(escrowTokenAccount);
    
    // Check if the escrow token account exists
    const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccountPubkey);
    
    if (!escrowAccountInfo) {
      console.error('Escrow token account does not exist');
      return {
        success: false,
        error: 'Escrow token account does not exist'
      };
    }
    
    // Get the seller's token account for this NFT
    const sellerTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,      // mint
      sellerPubkey     // owner
    );
    
    console.log(`Seller token account: ${sellerTokenAccount.toString()}`);
    
    // Check if the seller token account exists
    const sellerTokenAccountInfo = await connection.getAccountInfo(sellerTokenAccount);
    
    if (!sellerTokenAccountInfo) {
      console.error('Seller token account does not exist');
      return {
        success: false,
        error: 'Seller token account does not exist'
      };
    }
    
    // Create a transaction to transfer the NFT
    const transaction = new Transaction();
    
    // Add the instruction to transfer the NFT
    const transferInstruction = createTransferInstruction(
      sellerTokenAccount,       // source
      escrowTokenAccountPubkey, // destination
      sellerPubkey,             // owner (authority)
      1                         // amount (1 for NFT)
    );
    
    transaction.add(transferInstruction);
    
    // Get recent blockhash for the transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sellerPubkey;
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    return {
      success: true,
      transaction: serializedTransaction,
      blockhash,
      lastValidBlockHeight
    };
  } catch (error) {
    console.error('Error creating NFT transfer transaction:', error);
    throw error;
  }
}

/**
 * List an NFT on the marketplace
 * This function handles both steps of the listing process
 * @param {string} nftMint - The mint address of the NFT
 * @param {string} sellerWallet - The wallet address of the seller
 * @param {Connection} [connection] - Optional Solana connection
 * @returns {Object} Listing information
 */
export async function listNft(nftMint, sellerWallet, connection = null) {
  // Ensure connection is defined
  if (!connection) {
    console.log('No connection provided, creating a new connection');
    connection = getConnection();
  }

  console.log(`Listing NFT: ${nftMint}, seller: ${sellerWallet}`);
  
  try {
    // Step 1: Create escrow token account transaction
    const escrowResult = await createEscrowTokenAccountTransaction(nftMint, sellerWallet, connection);
    
    // Return information for client to handle
    return {
      step: escrowResult.exists ? 2 : 1,
      escrowTokenAccount: escrowResult.escrowTokenAccount,
      transaction: escrowResult.transaction,
      blockhash: escrowResult.blockhash,
      lastValidBlockHeight: escrowResult.lastValidBlockHeight,
      message: escrowResult.exists 
        ? 'Escrow token account already exists, proceed to transfer NFT' 
        : 'Create escrow token account first'
    };
  } catch (error) {
    console.error('Error listing NFT:', error);
    throw error;
  }
}

export default {
  getConnection,
  getMarketplaceWallet,
  createEscrowTokenAccountTransaction,
  createNftTransferTransaction,
  listNft
}; 