import dotenv from 'dotenv';
dotenv.config();

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  Keypair,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';

async function testMultiStepEscrowCreation() {
  // These should match the values used in your listing process
  const nftAddress = "HLHU9rkLJfbks7jjzCG8WHPB8aiqjFbo1SZA6HAoPptE"; // NFT that should be in escrow
  const ownerAddress = "ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD";
  
  try {
    // Connect to the Solana devnet
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
    
    // NFT mint address to check
    const nftMint = new PublicKey(nftAddress);
    
    // Marketplace authority - hardcoded for testing
    const marketplaceAuthority = new PublicKey('C4JWRGv7hoSsf6hEnNajMhgCSrsunXa3jtc3NQZ4kGco');
    console.log(`Using marketplace authority: ${marketplaceAuthority.toString()}`);
    
    // Derive the escrow keypair using the same method as the server
    const seed = Buffer.concat([
      marketplaceAuthority.toBuffer(),
      nftMint.toBuffer()
    ]);
    const escrowKeypair = Keypair.fromSeed(seed.slice(0, 32));
    console.log(`Derived escrow keypair: ${escrowKeypair.publicKey.toString()}`);
    
    // Get the owner's token account for this NFT
    const ownerTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      new PublicKey(ownerAddress)
    );
    console.log(`Owner token account: ${ownerTokenAccount.toString()}`);
    
    // Get the escrow token account for this NFT
    const escrowTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      escrowKeypair.publicKey
    );
    console.log(`Escrow token account: ${escrowTokenAccount.toString()}`);
    
    // Check if the owner token account exists and get its balance
    try {
      const ownerAccount = await getAccount(connection, ownerTokenAccount);
      console.log(`Owner token account exists with balance: ${ownerAccount.amount}`);
    } catch (error) {
      console.log(`Owner token account does not exist or error: ${error.message}`);
    }
    
    // Check if the escrow token account exists and get its balance
    try {
      const escrowAccount = await getAccount(connection, escrowTokenAccount);
      console.log(`Escrow token account exists with balance: ${escrowAccount.amount}`);
    } catch (error) {
      console.log(`Escrow token account does not exist or error: ${error.message}`);
    }
    
    console.log("\nDiagnosis:");
    console.log("If the escrow token account doesn't exist or has a balance of 0, the NFT is not in escrow.");
    console.log("If the owner token account has a balance of 1, the NFT is already with the owner.");
    console.log("For unlisting to work, the escrow token account must exist and have a balance of 1.");
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testMultiStepEscrowCreation(); 