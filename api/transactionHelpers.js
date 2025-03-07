import { 
  Connection, 
  Transaction, 
  PublicKey, 
  Commitment,
  TransactionSignature
} from '@solana/web3.js';

/**
 * Sends a transaction with fallback retry logic
 */
export async function sendTransactionWithFallback(
  wallet,
  transaction,
  connection,
  nftAddress,
  buyerAddress,
  responseData,
  notifyServer
) {
  const notify = async (signature, status) => {
    if (notifyServer) {
      try {
        await notifyServer(nftAddress, signature, status);
      } catch (error) {
        console.error('Failed to notify server:', error);
      }
    }
  };

  try {
    // Standard approach first
    const options = {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3
    };

    try {
      const signature = await wallet.sendTransaction(transaction, connection, options);
      console.log('Transaction sent successfully:', signature);
      await notify(signature, 'Pending');
      return signature;
    } catch (error) {
      console.warn('Standard transaction approach failed:', error);
    }

    // Fallback approach with more basic options
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    const fallbackOptions = {
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 5
    };

    const signature = await wallet.sendTransaction(transaction, connection, fallbackOptions);
    console.log('Fallback transaction successful:', signature);
    await notify(signature, 'Pending');
    return signature;

  } catch (error) {
    console.error('All transaction attempts failed:', error);
    return null;
  }
} 