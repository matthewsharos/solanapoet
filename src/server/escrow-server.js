import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  clusterApiUrl
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  AccountLayout
} from '@solana/spl-token';
import dotenv from 'dotenv';
import { createEscrowKeypair, deriveEscrowKeypair } from './escrow-utils.js';
import { recordNFTListing, verifySellerAddress, updateListingStatus, getSellerAddress } from '../utils/googleSheets.js';
import crypto from 'crypto';
import fetch from 'node-fetch';
import bs58 from 'bs58';
import { isNFTInEscrow } from './escrow-utils.js';

// Define the royalty receiver address as a constant
const ROYALTY_RECEIVER_ADDRESS = 'ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD';
const DEFAULT_ROYALTY_PERCENTAGE = 3; // Default to 3% royalty

// Helper function to fetch NFT metadata using Helius DAS API
async function fetchNFTMetadataFromHelius(nftAddress) {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.warn('HELIUS_API_KEY environment variable not set, using default royalty values');
      return null;
    }

    const url = `https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mintAccounts: [nftAddress],
        includeOffChain: true,
      }),
    });

    if (!response.ok) {
      console.warn(`Helius API returned status ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return data[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching NFT metadata from Helius:', error);
    return null;
  }
}

// Helper function for SheetBest API calls
async function sheetBestAPI(method = 'GET', path = '', data = null) {
  const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
  
  if (!sheetBestUrl) {
    throw new Error('GOOGLE_SHEETS_API_URL environment variable is not set');
  }
  
  const url = `${sheetBestUrl}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// Add this function to get Metaplex Metadata PDA
const getMetadataPDA = async (mint) => {
  const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const [metadataAddress] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return metadataAddress;
};

// Create Express app
const app = express();
const PORT = 3002; // Use port 3002 since that's what the client is configured to use

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({ status: 'ok', server: 'escrow-server', port: PORT });
});

// Add market initialize endpoint
app.get('/api/market/initialize', (req, res) => {
  console.log('Market initialize requested');
  res.status(200).json({ 
    success: true, 
    message: 'Market initialized',
    data: {
      serverInfo: {
        type: 'escrow-server',
        version: '1.0',
        port: PORT
      }
    }
  });
});

// Add check-minter authentication endpoint
app.get('/api/auth/check-minter/:walletAddress', (req, res) => {
  const { walletAddress } = req.params;
  console.log(`Check minter requested for wallet: ${walletAddress}`);
  
  // You can implement actual authorization logic here
  // For now, we'll authorize all wallets for testing
  const isAuthorized = true;
  
  res.status(200).json({
    success: true,
    isAuthorized,
    isMinter: isAuthorized,
    walletAddress
  });
});

// Endpoint to list an NFT for sale
app.post('/api/market/listings', async (req, res) => {
  try {
    console.log('Listing NFT request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Body type:', typeof req.body);
    console.log('Body keys:', Object.keys(req.body));
    
    // Validate request parameters
    const { nftAddress, sellerAddress, walletAddress, price, name, description, imageUrl, attributes, collectionId } = req.body;
    
    // Use walletAddress as fallback if sellerAddress is not provided
    const effectiveSellerAddress = sellerAddress || walletAddress;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- sellerAddress: ${effectiveSellerAddress} ${typeof effectiveSellerAddress}`);
    console.log(`- price: ${price} ${typeof price}`);
    
    // Format collection data for storage
    let formattedCollectionId = '{}';
    if (collectionId) {
      try {
        // If it's already a string, use it directly, otherwise stringify it
        if (typeof collectionId === 'string') {
          formattedCollectionId = collectionId;
        } else {
          formattedCollectionId = JSON.stringify(collectionId);
        }
        console.log(`- collectionId (formatted): ${formattedCollectionId}`);
      } catch (error) {
        console.error('Error formatting collection data:', error);
      }
    }
    
    if (!nftAddress || !effectiveSellerAddress || price === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress, sellerAddress (or walletAddress), and price are required' 
      });
    }
    
    // Create a connection to the Solana network
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
      'confirmed'
    );
    
    // Get the marketplace authority from environment or use a default
    const marketplaceAuthority = process.env.MARKETPLACE_AUTHORITY || 'C4JWRGv7hoSsf6hEnNajMhgCSrsunXa3jtc3NQZ4kGco';
    console.log(`Using marketplace authority: ${marketplaceAuthority}`);
    
    // Derive escrow keypair from NFT address
    const escrowKeypair = deriveEscrowKeypair(nftAddress);
    console.log(`Using escrow keypair: ${escrowKeypair.publicKey.toString()}`);
    
    // Get the owner's token account for this NFT
    const ownerTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      new PublicKey(effectiveSellerAddress)
    );
    console.log(`Owner token account: ${ownerTokenAccount.toString()}`);
    
    // Get the escrow token account for this NFT
    const escrowTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      escrowKeypair.publicKey
    );
    console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
    
    // Create a new transaction
    const transaction = new Transaction();
    
    // Check if the escrow token account exists
    const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccount);
    
    // If the escrow token account doesn't exist, create it
    if (!escrowAccountInfo) {
      console.log('Escrow token account does not exist, adding instruction to create it...');
      
      console.log('Creating escrow token account instruction with:');
      console.log(`- Payer (seller): ${effectiveSellerAddress}`);
      console.log(`- ATA: ${escrowTokenAccount.toString()}`);
      console.log(`- Owner (Escrow Keypair): ${escrowKeypair.publicKey.toString()}`);
      console.log(`- Mint (NFT): ${nftAddress}`);
      
      // Create instruction to create the escrow token account
      const createEscrowTokenAccountInstruction = createAssociatedTokenAccountInstruction(
        new PublicKey(effectiveSellerAddress), // payer
        escrowTokenAccount, // associated token account
        escrowKeypair.publicKey, // owner
        new PublicKey(nftAddress) // mint
      );
      
      transaction.add(createEscrowTokenAccountInstruction);
    }
    
    // Add instruction to transfer the NFT from seller to escrow
    console.log('Adding transfer instruction to move NFT from seller to escrow...');
    console.log(`- Source: ${ownerTokenAccount.toString()}`);
    console.log(`- Destination: ${escrowTokenAccount.toString()}`);
    console.log(`- Owner: ${effectiveSellerAddress}`);
    
    const transferInstruction = createTransferInstruction(
      ownerTokenAccount, // source
      escrowTokenAccount, // destination
      new PublicKey(effectiveSellerAddress), // owner
      1 // amount (NFTs have amount 1)
    );
    
    transaction.add(transferInstruction);
    
    // Set the fee payer to the seller
    transaction.feePayer = new PublicKey(effectiveSellerAddress);
    
    // Get a recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Record the NFT listing in Google Sheets
    try {
      console.log(`Recording NFT listing with seller_id: ${effectiveSellerAddress}`);
      console.log(`NFT Address: ${nftAddress}, Price: ${price}, Seller Address (will be used as seller_id): ${effectiveSellerAddress}`);
      console.log(`Collection data: ${formattedCollectionId}`);
      
      // Create a listing object for the SheetBest API
      const listingData = {
        nftAddress,
        sellerAddress: effectiveSellerAddress,
        price,
        sellerId: effectiveSellerAddress,
        collectionId: formattedCollectionId
      };
      
      await recordNFTListing(nftAddress, effectiveSellerAddress, price, effectiveSellerAddress, formattedCollectionId);
      console.log(`Recorded NFT listing in Google Sheets: ${nftAddress} by ${effectiveSellerAddress}`);
    } catch (sheetsError) {
      console.error('Error recording NFT listing in Google Sheets:', sheetsError);
      // Continue with the response even if Google Sheets recording fails
    }
    
    // Return the transaction to the client
    res.status(200).json({
      success: true,
      message: 'NFT listing transaction created',
      data: {
        nftAddress: nftAddress,
        sellerAddress: effectiveSellerAddress,
        price: price
      },
      transaction: serializedTransaction.toString('base64'),
      blockhash,
      lastValidBlockHeight
    });
  } catch (error) {
    console.error('Error creating listing transaction:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating listing transaction', 
      error: error.message 
    });
  }
});

// Endpoint to unlist an NFT
app.post('/api/market/unlist', async (req, res) => {
  try {
    console.log('Unlist request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, ownerAddress } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- ownerAddress: ${ownerAddress} ${typeof ownerAddress}`);
    
    if (!nftAddress || !ownerAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and ownerAddress are required' 
      });
    }
    
    // Verify that the wallet is the original seller
    const isOriginalSeller = await verifySellerAddress(nftAddress, ownerAddress);
    
    if (!isOriginalSeller) {
      return res.status(403).json({ 
        success: false, 
        message: 'Wallet is not the original seller of this NFT' 
      });
    }
    
    try {
      // Create connection to the Solana network
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
        'confirmed'
      );
      
      // Derive the escrow keypair for this NFT
      const escrowKeypair = deriveEscrowKeypair(nftAddress);
      console.log(`Using escrow keypair: ${escrowKeypair.publicKey.toString()}`);
      
      // Get the owner's token account for this NFT
      const ownerTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(nftAddress),
        new PublicKey(ownerAddress)
      );
      console.log(`Owner token account: ${ownerTokenAccount.toString()}`);
      
      // Get the escrow token account for this NFT
      const escrowTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(nftAddress),
        escrowKeypair.publicKey
      );
      console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
      
      // Check if escrow token account exists and has the NFT
      console.log('Checking if NFT is in escrow...');
      let nftInEscrow = false;
      try {
        const escrowTokenAccountInfo = await connection.getAccountInfo(escrowTokenAccount);
        if (escrowTokenAccountInfo && escrowTokenAccountInfo.data.length > 0) {
          console.log('Escrow token account exists, checking balance...');
          try {
            const tokenAccountInfo = await getAccount(connection, escrowTokenAccount);
            console.log(`Escrow token amount: ${tokenAccountInfo.amount}`);
            nftInEscrow = tokenAccountInfo.amount === 1n; // NFTs have amount 1
          } catch (tokenError) {
            console.error('Error getting token account info:', tokenError);
          }
        }
      } catch (error) {
        console.error('Error checking escrow token account:', error);
      }
      
      // Return all the necessary account information
      return res.status(200).json({
        success: true,
        action: 'unlist',
        nftInEscrow,
        escrowAccount: {
          publicKey: escrowKeypair.publicKey.toString(),
          secretKey: Buffer.from(escrowKeypair.secretKey).toString('base64')
        },
        accounts: {
          mint: nftAddress,
          ownerAddress: ownerAddress,
          ownerTokenAccount: ownerTokenAccount.toString(),
          escrowTokenAccount: escrowTokenAccount.toString()
        },
        message: 'Unlist data prepared'
      });
    } catch (error) {
      console.error('Error creating unlist data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error creating unlist data', 
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Error processing unlist request:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing unlist request', 
      error: error.message 
    });
  }
});

// Endpoint to buy an NFT
app.post('/api/market/buy', async (req, res) => {
  try {
    console.log('Buying NFT request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, buyerAddress, price } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- buyerAddress: ${buyerAddress} ${typeof buyerAddress}`);
    console.log(`- price: ${price} ${typeof price}`);
    
    if (!nftAddress || !buyerAddress || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress, buyerAddress, and price are required' 
      });
    }
    
    // Create a connection to the Solana network
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
      'confirmed'  // Use confirmed commitment level for better compatibility
    );
    
    // Special handling for the royalty receiver address
    const isRoyaltyReceiver = buyerAddress === ROYALTY_RECEIVER_ADDRESS;
    if (isRoyaltyReceiver) {
      console.log(`ROYALTY RECEIVER ${ROYALTY_RECEIVER_ADDRESS} is attempting to purchase NFT ${nftAddress}`);
    }
    
    // Check if the NFT is in escrow using the utility function
    let inEscrow = false;
    let sellerInfo = null;
    
    try {
      // Try to get seller info from the database
      sellerInfo = await getSellerAddress(nftAddress);
    } catch (dbError) {
      console.error(`Error getting seller address from database: ${dbError.message}`);
      return res.status(500).json({ success: false, message: `Error retrieving seller information: ${dbError.message}` });
    }
    
    if (!sellerInfo || !sellerInfo.sellerAddress) {
      console.error(`NFT ${nftAddress} not found in database`);
      return res.status(404).json({ success: false, message: 'NFT not found in database' });
    }
    
    // Check if the NFT is in escrow
    try {
      inEscrow = await isNFTInEscrow(nftAddress);
      console.log(`NFT ${nftAddress} in escrow: ${inEscrow}`);
    } catch (error) {
      console.error(`Error checking if NFT is in escrow: ${error.message}`);
      return res.status(500).json({ success: false, message: `Error checking escrow status: ${error.message}` });
    }
    
    if (!inEscrow) {
      console.error(`NFT ${nftAddress} is not in escrow`);
      return res.status(400).json({ success: false, message: 'NFT is not in escrow' });
    }
    
    console.log(`NFT ${nftAddress} is confirmed to be in escrow - proceeding with purchase`);
    
    // Get the marketplace authority from environment or use a default
    const marketplaceAuthority = process.env.MARKETPLACE_AUTHORITY || 'C4JWRGv7hoSsf6hEnNajMhgCSrsunXa3jtc3NQZ4kGco';
    console.log(`Using marketplace authority: ${marketplaceAuthority}`);
    
    // Derive the escrow keypair for this NFT
    const escrowKeypair = deriveEscrowKeypair(nftAddress);
    console.log(`Using escrow keypair: ${escrowKeypair.publicKey.toString()}`);
    
    // Get the buyer's token account for this NFT
    const buyerTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      new PublicKey(buyerAddress)
    );
    console.log(`Buyer token account: ${buyerTokenAccount.toString()}`);
    
    // Get the escrow token account for this NFT
    const escrowTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      escrowKeypair.publicKey
    );
    console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
    
    // Create a new transaction
    const transaction = new Transaction();
    
    // Check if the buyer's token account exists, if not, create it
    const buyerTokenAccountInfo = await connection.getAccountInfo(buyerTokenAccount);
    if (!buyerTokenAccountInfo) {
      console.log('Buyer token account does not exist, adding instruction to create it...');
      const createTokenAccountIx = createAssociatedTokenAccountInstruction(
        new PublicKey(buyerAddress), // payer
        buyerTokenAccount, // associated token account address
        new PublicKey(buyerAddress), // owner
        new PublicKey(nftAddress) // mint
      );
      transaction.add(createTokenAccountIx);
    }
    
    // The NFT is already confirmed to be in escrow at this point
    console.log('NFT is confirmed to be in escrow, continuing with purchase transaction...');
    
    // Get seller info if we don't already have it
    if (!sellerInfo) {
      try {
        sellerInfo = await getSellerAddress(nftAddress);
      } catch (dbError) {
        console.error(`Error getting seller address: ${dbError.message}`);
        return res.status(500).json({
          success: false,
          message: 'Error retrieving seller information from database'
        });
      }
    }

    if (!sellerInfo || !sellerInfo.sellerAddress) {
      return res.status(400).json({
        success: false,
        message: 'NFT listing not found in database'
      });
    }

    const sellerAddress = sellerInfo.sellerAddress;
    console.log(`Found seller address: ${sellerAddress}`);
    
    // Calculate royalty amount (3% of the price)
    const priceInLamports = LAMPORTS_PER_SOL * price;
    const royaltyPercentage = DEFAULT_ROYALTY_PERCENTAGE;
    const royaltyAmount = Math.floor(priceInLamports * (royaltyPercentage / 100));
    const sellerAmount = priceInLamports - royaltyAmount;
    
    console.log(`Price breakdown:`);
    console.log(`- Total price: ${priceInLamports / LAMPORTS_PER_SOL} SOL (${priceInLamports} lamports)`);
    console.log(`- Royalty (${royaltyPercentage}%): ${royaltyAmount / LAMPORTS_PER_SOL} SOL (${royaltyAmount} lamports)`);
    console.log(`- Seller amount: ${sellerAmount / LAMPORTS_PER_SOL} SOL (${sellerAmount} lamports)`);
    
    // Add instruction to transfer NFT from escrow to buyer
    console.log('Adding instruction to transfer NFT from escrow to buyer...');
    console.log(`- Source: ${escrowTokenAccount.toString()}`);
    console.log(`- Destination: ${buyerTokenAccount.toString()}`);
    console.log(`- Owner (Escrow): ${escrowKeypair.publicKey.toString()}`);
    
    const transferInstruction = createTransferInstruction(
      escrowTokenAccount, // source
      buyerTokenAccount, // destination
      escrowKeypair.publicKey, // owner (escrow)
      1 // amount (NFTs have amount 1)
    );
    
    transaction.add(transferInstruction);
    
    // Add instruction to transfer SOL from buyer to seller (minus royalty fee)
    if (sellerAmount > 0) {
      console.log(`Adding instruction to transfer ${sellerAmount / LAMPORTS_PER_SOL} SOL to seller (${sellerAddress})...`);
      const transferToSellerIx = SystemProgram.transfer({
        fromPubkey: new PublicKey(buyerAddress),
        toPubkey: new PublicKey(sellerAddress),
        lamports: sellerAmount
      });
      transaction.add(transferToSellerIx);
    }
    
    // Add instruction to transfer royalty fee from buyer to royalty receiver
    if (royaltyAmount > 0) {
      console.log(`Adding instruction to transfer ${royaltyAmount / LAMPORTS_PER_SOL} SOL royalty to ${ROYALTY_RECEIVER_ADDRESS}...`);
      const transferRoyaltyIx = SystemProgram.transfer({
        fromPubkey: new PublicKey(buyerAddress),
        toPubkey: new PublicKey(ROYALTY_RECEIVER_ADDRESS),
        lamports: royaltyAmount
      });
      transaction.add(transferRoyaltyIx);
    }
    
    // Set the fee payer to the buyer and get a fresh blockhash with confirmed commitment
    transaction.feePayer = new PublicKey(buyerAddress);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign the transaction with the escrow keypair
    transaction.partialSign(escrowKeypair);
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Return the transaction to the client along with payment breakdown
    res.status(200).json({
      success: true,
      message: 'NFT purchase transaction created',
      data: {
        nftAddress: nftAddress,
        buyerAddress: buyerAddress,
        sellerAddress: sellerAddress,
        price: price,
        breakdown: {
          totalPrice: price,
          royaltyPercentage: royaltyPercentage,
          royaltyAmount: royaltyAmount / LAMPORTS_PER_SOL,
          sellerAmount: sellerAmount / LAMPORTS_PER_SOL,
          creatorAddress: ROYALTY_RECEIVER_ADDRESS
        }
      },
      transaction: serializedTransaction.toString('base64'),
      blockhash,
      lastValidBlockHeight
    });
  } catch (error) {
    console.error('Error creating purchase transaction:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating purchase transaction', 
      error: error.message 
    });
  }
});

// Endpoint to handle purchase failures
app.post('/api/market/purchase-failed', async (req, res) => {
  try {
    console.log('Purchase failure notification received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, buyerAddress } = req.body;
    
    if (!nftAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: nftAddress is required' 
      });
    }
    
    // Log the failure
    console.log(`Purchase failed for NFT: ${nftAddress} by buyer: ${buyerAddress || 'unknown'}`);
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Purchase failure recorded successfully'
    });
  } catch (error) {
    console.error('Error handling purchase failure:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing purchase failure'
    });
  }
});

// Endpoint to handle successful transactions
app.post('/api/market/confirm-purchase', async (req, res) => {
  try {
    console.log('Purchase confirmation received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, signature, status } = req.body;
    
    if (!nftAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and signature are required' 
      });
    }
    
    // Log the confirmation
    console.log(`Purchase confirmation for NFT: ${nftAddress} with signature: ${signature} and status: ${status || 'Sold'}`);
    
    // Create a connection to check transaction status if needed
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
      'confirmed'
    );
    
    // Handle different status values
    const effectiveStatus = status || 'Sold';
    
    // For pending transactions, check the status on the blockchain
    if (effectiveStatus === 'Pending') {
      try {
        console.log(`Checking blockchain status for transaction: ${signature}`);
        const signatureStatus = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true
        });
        
        console.log(`Transaction status from blockchain:`, signatureStatus);
        
        // If the transaction is confirmed, update the status to Sold
        if (signatureStatus && 
            signatureStatus.value && 
            signatureStatus.value.confirmationStatus && 
            ['confirmed', 'finalized'].includes(signatureStatus.value.confirmationStatus)) {
          console.log(`Transaction ${signature} is confirmed on blockchain, updating status to Sold`);
          // Update the status to Sold
          console.log(`Calling updateListingStatus for NFT ${nftAddress} with status Sold`);
          const updateResult = await updateListingStatus(nftAddress, 'Sold');
          console.log(`updateListingStatus result: ${updateResult}`);
          
          return res.status(200).json({
            success: true,
            message: 'Transaction confirmed on blockchain, purchase recorded successfully',
            data: {
              nftAddress,
              signature,
              status: 'Sold',
              blockchainStatus: signatureStatus.value.confirmationStatus,
              updateResult
            }
          });
        } else {
          // Transaction is still pending or not found
          console.log(`Transaction ${signature} is still pending or not found on blockchain`);
          
          // We don't update the listing status yet, but acknowledge the pending status
          return res.status(200).json({
            success: true,
            message: 'Transaction is pending, no changes made to listing',
            data: {
              nftAddress,
              signature,
              status: 'Pending',
              blockchainStatus: signatureStatus?.value?.confirmationStatus || 'unknown'
            }
          });
        }
      } catch (blockchainError) {
        console.error(`Error checking blockchain status: ${blockchainError.message}`);
        // Continue with normal processing if blockchain check fails
      }
    }
    
    // For Sold or Unlisted status, update the listing in Google Sheets
    if (effectiveStatus === 'Unlisted' || effectiveStatus === 'Sold') {
      try {
        console.log(`Removing NFT ${nftAddress} from Google Sheets with status: ${effectiveStatus}`);
        console.log(`Calling updateListingStatus for NFT ${nftAddress} with status ${effectiveStatus}`);
        const updateResult = await updateListingStatus(nftAddress, effectiveStatus);
        console.log(`updateListingStatus result: ${updateResult}`);
        
        if (updateResult) {
          console.log(`Successfully updated NFT ${nftAddress} in Google Sheets with status ${effectiveStatus}`);
        } else {
          console.warn(`Failed to update NFT ${nftAddress} in Google Sheets with status ${effectiveStatus}`);
        }
      } catch (sheetsError) {
        console.error('Error updating listing status in Google Sheets:', sheetsError);
        // Continue with the response even if Google Sheets update fails
      }
    } else {
      // For other statuses, update the status
      try {
        console.log(`Calling updateListingStatus for NFT ${nftAddress} with status ${effectiveStatus}`);
        const updateResult = await updateListingStatus(nftAddress, effectiveStatus);
        console.log(`updateListingStatus result: ${updateResult}`);
        
        if (updateResult) {
          console.log(`Updated listing status for ${nftAddress} to ${effectiveStatus}`);
        } else {
          console.warn(`Failed to update listing status for ${nftAddress} to ${effectiveStatus}`);
        }
      } catch (sheetsError) {
        console.error('Error updating listing status in Google Sheets:', sheetsError);
        // Continue with the response even if Google Sheets update fails
      }
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Purchase confirmation recorded successfully',
      data: {
        nftAddress,
        signature,
        status: effectiveStatus
      }
    });
  } catch (error) {
    console.error('Error handling purchase confirmation:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing purchase confirmation'
    });
  }
});

// Add check-seller endpoint
app.post('/check-seller', async (req, res) => {
  try {
    console.log('Check seller request received:', req.body);
    
    // Validate request parameters
    const { nftAddress, walletAddress } = req.body;
    
    if (!nftAddress || !walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and walletAddress are required',
        isOriginalSeller: false
      });
    }
    
    // Special case for royalty receiver
    if (walletAddress === ROYALTY_RECEIVER_ADDRESS) {
      console.log(`ROYALTY RECEIVER OVERRIDE: Automatically verifying ${walletAddress} as seller for NFT ${nftAddress}`);
      return res.status(200).json({
        success: true,
        isOriginalSeller: true,
        message: 'Royalty receiver is always verified as seller'
      });
    }
    
    // Use the verifySellerAddress function from googleSheets.js
    const { verifySellerAddress } = await import('../utils/googleSheets.js');
    const isOriginalSeller = await verifySellerAddress(nftAddress, walletAddress);
    
    console.log(`Seller verification result for NFT ${nftAddress} and wallet ${walletAddress}: ${isOriginalSeller}`);
    
    return res.status(200).json({
      success: true,
      isOriginalSeller,
      message: isOriginalSeller ? 'Wallet is verified as the original seller' : 'Wallet is not the original seller'
    });
  } catch (error) {
    console.error('Error checking seller:', error);
    return res.status(500).json({
      success: false,
      isOriginalSeller: false,
      message: `Error checking seller: ${error.message}`
    });
  }
});

// Add the check-seller endpoint to the api/market path as well
app.post('/api/market/check-seller', async (req, res) => {
  try {
    console.log('Check seller request received (api/market path):');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, walletAddress } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- walletAddress: ${walletAddress} ${typeof walletAddress}`);
    
    if (!nftAddress || !walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and walletAddress are required' 
      });
    }
    
    // Verify that the wallet is the original seller
    const isOriginalSeller = await verifySellerAddress(nftAddress, walletAddress);
    
    res.status(200).json({
      success: true,
      isOriginalSeller: isOriginalSeller
    });
    
  } catch (error) {
    console.error('Error checking seller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking seller', 
      error: error.message 
    });
  }
});

// Endpoint to update listing status in Google Sheets
app.post('/api/market/update-listing-status', async (req, res) => {
  try {
    console.log('Update listing status request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, status } = req.body;
    
    if (!nftAddress || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and status are required' 
      });
    }
    
    // Update the listing status in Google Sheets
    try {
      await updateListingStatus(nftAddress, status);
      console.log(`Updated listing status in Google Sheets: ${nftAddress} marked as ${status}`);
      
      res.status(200).json({
        success: true,
        message: `Listing status updated to ${status}`,
        data: {
          nftAddress,
          status
        }
      });
    } catch (sheetsError) {
      console.error('Error updating listing status in Google Sheets:', sheetsError);
      res.status(500).json({ 
        success: false, 
        message: 'Error updating listing status in Google Sheets', 
        error: sheetsError.message 
      });
    }
  } catch (error) {
    console.error('Error in update-listing-status endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error handling update listing status request', 
      error: error.message 
    });
  }
});

// Endpoint to handle on-chain unlisting directly from the server
app.post('/api/market/server-unlist', async (req, res) => {
  try {
    console.log('Server-side unlisting request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, ownerAddress } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- ownerAddress: ${ownerAddress} ${typeof ownerAddress}`);
    
    if (!nftAddress || !ownerAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and ownerAddress are required' 
      });
    }
    
    // Verify that the requester is the original seller or has the correct Seller_ID
    const isVerifiedSeller = await verifySellerAddress(nftAddress, ownerAddress);
    if (!isVerifiedSeller) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to unlist this NFT. Only the original seller or the account with the matching Seller_ID can unlist it.'
      });
    }
    
    // Create a connection to the Solana network
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
      'confirmed'
    );
    
    // Derive the escrow keypair for this NFT
    const escrowKeypair = deriveEscrowKeypair(nftAddress);
    console.log(`Using escrow keypair: ${escrowKeypair.publicKey.toString()}`);
    
    // Get the owner's token account for this NFT
    const ownerTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      new PublicKey(ownerAddress)
    );
    console.log(`Owner token account: ${ownerTokenAccount.toString()}`);
    
    // Get the escrow token account for this NFT
    const escrowTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(nftAddress),
      escrowKeypair.publicKey
    );
    console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
    
    // Check if escrow token account exists and has the NFT
    console.log('Checking escrow token account...');
    let escrowTokenAccountInfo;
    try {
      escrowTokenAccountInfo = await getAccount(connection, escrowTokenAccount);
      console.log(`Escrow token account data:`, escrowTokenAccountInfo);
      console.log(`Escrow token amount: ${escrowTokenAccountInfo.amount}`);
      
      // The amount is returned as a BigInt, so we need to convert it to a number or string for comparison
      if (!escrowTokenAccountInfo || escrowTokenAccountInfo.amount !== 1n) {
        return res.status(400).json({
          success: false,
          message: 'NFT is not in escrow. It may already be with the owner.',
          data: {
            nftAddress,
            ownerAddress,
            escrowTokenAccount: escrowTokenAccount.toString(),
            ownerTokenAccount: ownerTokenAccount.toString()
          }
        });
      }
      console.log(`Escrow token account exists with balance: ${escrowTokenAccountInfo.amount}, confirming NFT is in escrow`);
    } catch (error) {
      console.error('Error checking escrow token account:', error);
      return res.status(400).json({
        success: false,
        message: 'NFT is not in escrow. Escrow token account does not exist or cannot be accessed.',
        error: error.message
      });
    }
    
    // Create a new transaction
    const transaction = new Transaction();
    
    // Check if owner token account exists, if not create it
    const ownerTokenAccountInfo = await connection.getAccountInfo(ownerTokenAccount);
    if (!ownerTokenAccountInfo) {
      console.log('Owner token account does not exist, adding instruction to create it...');
      
      const createOwnerTokenAccountInstruction = createAssociatedTokenAccountInstruction(
        escrowKeypair.publicKey, // payer (using escrow account as payer)
        ownerTokenAccount, // associated token account 
        new PublicKey(ownerAddress), // owner
        new PublicKey(nftAddress) // mint
      );
      
      transaction.add(createOwnerTokenAccountInstruction);
    }
    
    // Add instruction to transfer the NFT from escrow back to owner
    console.log('Adding transfer instruction to move NFT from escrow back to owner...');
    console.log(`- Source: ${escrowTokenAccount.toString()}`);
    console.log(`- Destination: ${ownerTokenAccount.toString()}`);
    console.log(`- Owner (Escrow): ${escrowKeypair.publicKey.toString()}`);
    
    const transferInstruction = createTransferInstruction(
      escrowTokenAccount, // source
      ownerTokenAccount, // destination
      escrowKeypair.publicKey, // owner (escrow)
      1 // amount (NFTs have amount 1)
    );
    
    transaction.add(transferInstruction);
    
    // Set the fee payer to the escrow account
    transaction.feePayer = escrowKeypair.publicKey;
    
    // Get a recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    // Sign the transaction with the escrow keypair
    transaction.sign(escrowKeypair);
    
    // Send the transaction
    try {
      console.log('Sending transaction...');
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'processed'
      });
      
      console.log(`Transaction sent with signature: ${signature}`);
      
      // Wait for confirmation
      console.log('Waiting for transaction confirmation...');
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('Transaction confirmed with error:', confirmation.value.err);
        return res.status(500).json({
          success: false,
          message: 'Transaction confirmed with error',
          error: confirmation.value.err
        });
      }
      
      console.log('Transaction confirmed successfully!');
      
      // Update the listing status in Google Sheets
      try {
        await updateListingStatus(nftAddress, 'Unlisted');
        console.log(`Updated listing status in Google Sheets: ${nftAddress} marked as Unlisted`);
      } catch (sheetsError) {
        console.error('Error updating listing status in Google Sheets:', sheetsError);
        // Continue with the response even if Google Sheets update fails
      }
      
      return res.status(200).json({
        success: true,
        message: 'NFT successfully unlisted and returned to owner',
        data: {
          nftAddress,
          ownerAddress,
          signature
        }
      });
    } catch (sendError) {
      console.error('Error sending transaction:', sendError);
      return res.status(500).json({
        success: false,
        message: 'Error sending transaction',
        error: sendError.message
      });
    }
  } catch (error) {
    console.error('Error in server-side unlisting:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error in server-side unlisting', 
      error: error.message 
    });
  }
});

// Add the listings endpoint
app.post('/api/market/listings', async (req, res) => {
  try {
    console.log('Listings request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddresses } = req.body;
    
    if (!nftAddresses || !Array.isArray(nftAddresses)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddresses is required and must be an array' 
      });
    }
    
    // Get all listings from the database
    const allListings = {};
    
    // Use a faster approach with SheetBest API directly if available
    const sheetBestUrl = process.env.GOOGLE_SHEETS_API_URL;
    if (sheetBestUrl) {
      try {
        console.log('Using SheetBest API directly for listings');
        
        // Set a timeout for the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch(sheetBestUrl, {
          signal: controller.signal
        });
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`SheetBest API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Found ${data.length} listings via SheetBest API`);
        
        // Filter the listings for the requested NFTs
        for (const nftAddress of nftAddresses) {
          const matchingListing = data.find(listing => listing.mint_id === nftAddress);
          if (matchingListing) {
            allListings[nftAddress] = {
              seller_address: matchingListing.seller_id,
              price: parseFloat(matchingListing.list_price_sol) || 1.0,
              list_date: matchingListing.list_date || new Date().toISOString()
            };
          }
        }
        
        // Return the listings immediately
        return res.status(200).json(allListings);
      } catch (error) {
        console.error('Error using SheetBest API directly:', error);
        // Continue with the individual lookups as fallback
      }
    }
    
    // Fallback: For each NFT address, check if it's in our database individually
    console.log('Using individual lookups for listings');
    
    // Use Promise.all to parallelize the lookups with individual timeouts
    const lookupPromises = nftAddresses.map(async (nftAddress) => {
      try {
        // Create a promise that rejects after a timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Lookup timed out')), 1000); // 1 second timeout per lookup
        });
        
        // Create the actual lookup promise
        const lookupPromise = getSellerAddress(nftAddress);
        
        // Race the two promises
        const sellerInfo = await Promise.race([lookupPromise, timeoutPromise]);
        
        if (sellerInfo && sellerInfo.sellerAddress) {
          return {
            nftAddress,
            listing: {
              seller_address: sellerInfo.sellerAddress,
              price: sellerInfo.price || 1.0, // Default price if not specified
              list_date: new Date().toISOString()
            }
          };
        }
        return { nftAddress, listing: null };
      } catch (error) {
        console.error(`Error getting seller for NFT ${nftAddress}:`, error);
        return { nftAddress, listing: null };
      }
    });
    
    // Wait for all lookups to complete (or timeout)
    const results = await Promise.all(lookupPromises);
    
    // Process the results
    results.forEach(result => {
      if (result.listing) {
        allListings[result.nftAddress] = result.listing;
      }
    });
    
    res.status(200).json(allListings);
  } catch (error) {
    console.error('Error handling listings request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing listings request', 
      error: error.message 
    });
  }
});

// Add the purchase endpoint
app.post('/api/market/purchase', async (req, res) => {
  try {
    console.log('Purchase request received:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Validate request parameters
    const { nftAddress, buyerAddress } = req.body;
    
    console.log('Extracted parameters:');
    console.log(`- nftAddress: ${nftAddress} ${typeof nftAddress}`);
    console.log(`- buyerAddress: ${buyerAddress} ${typeof buyerAddress}`);
    
    if (!nftAddress || !buyerAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: nftAddress and buyerAddress are required' 
      });
    }
    
    // Get the seller address for this NFT
    const sellerAddress = await getSellerAddress(nftAddress);
    
    if (!sellerAddress) {
      return res.status(404).json({ 
        success: false, 
        message: 'NFT not found or not listed for sale' 
      });
    }
    
    // Create transaction information for the purchase
    try {
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d',
        'confirmed'
      );
      
      // Derive the escrow keypair for this NFT
      const escrowKeypair = deriveEscrowKeypair(nftAddress);
      console.log(`Using escrow keypair: ${escrowKeypair.publicKey.toString()}`);
      
      // Get the buyer's token account for this NFT
      const buyerTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(nftAddress),
        new PublicKey(buyerAddress)
      );
      console.log(`Buyer token account: ${buyerTokenAccount.toString()}`);
      
      // Get the escrow token account for this NFT
      const escrowTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(nftAddress),
        escrowKeypair.publicKey
      );
      console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
      
      // Check if escrow token account exists and has the NFT
      console.log('Checking if NFT is in escrow...');
      let nftInEscrow = false;
      try {
        const escrowTokenAccountInfo = await connection.getAccountInfo(escrowTokenAccount);
        if (escrowTokenAccountInfo && escrowTokenAccountInfo.data.length > 0) {
          console.log('Escrow token account exists, checking balance...');
          try {
            const tokenAccountInfo = await getAccount(connection, escrowTokenAccount);
            console.log(`Escrow token amount: ${tokenAccountInfo.amount}`);
            nftInEscrow = tokenAccountInfo.amount === 1n; // NFTs have amount 1
          } catch (tokenError) {
            console.error('Error getting token account info:', tokenError);
          }
        }
      } catch (error) {
        console.error('Error checking escrow token account:', error);
      }
      
      // If NFT is not in escrow, return an error
      if (!nftInEscrow) {
        return res.status(404).json({
          success: false,
          message: 'NFT not found in escrow'
        });
      }
      
      // Return all the necessary account information
      return res.status(200).json({
        success: true,
        action: 'purchase',
        nftInEscrow,
        escrowAccount: {
          publicKey: escrowKeypair.publicKey.toString(),
          secretKey: Buffer.from(escrowKeypair.secretKey).toString('base64')
        },
        accounts: {
          mint: nftAddress,
          sellerAddress: sellerAddress,
          buyerAddress: buyerAddress,
          buyerTokenAccount: buyerTokenAccount.toString(),
          escrowTokenAccount: escrowTokenAccount.toString()
        },
        message: 'Purchase data prepared'
      });
    } catch (error) {
      console.error('Error creating purchase data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error creating purchase data', 
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Error processing purchase request:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing purchase request', 
      error: error.message 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Escrow server running on port ${PORT}`);
}); 