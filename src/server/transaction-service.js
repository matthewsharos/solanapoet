/**
 * Transaction Service
 * 
 * This service handles sending signed transactions to the Solana network.
 */

import { Connection, Transaction } from '@solana/web3.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Helius RPC URL from environment or use fallback
const heliusRpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1aac55c4-5c9d-411a-bd46-37479a165e6d';

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
 * Send a signed transaction to the Solana network
 * @param {string} signedTransactionBase64 - The signed transaction in base64 format
 * @returns {Object} Transaction result
 */
export async function sendSignedTransaction(signedTransactionBase64) {
  const connection = getConnection();
  
  try {
    console.log('Sending signed transaction to Solana network');
    
    // Deserialize the transaction
    const transaction = Transaction.from(Buffer.from(signedTransactionBase64, 'base64'));
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, preflightCommitment: 'confirmed' }
    );
    
    console.log(`Transaction sent with signature: ${signature}`);
    
    // Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: transaction.recentBlockhash,
      lastValidBlockHeight: transaction.lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err);
      return {
        success: false,
        signature,
        error: confirmation.value.err
      };
    }
    
    console.log('Transaction confirmed successfully');
    return {
      success: true,
      signature
    };
  } catch (error) {
    console.error('Error sending transaction:', error);
    return {
      success: false,
      error: error.message || 'Failed to send transaction'
    };
  }
}

export default {
  getConnection,
  sendSignedTransaction
}; 