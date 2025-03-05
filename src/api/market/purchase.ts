import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { NFT } from '../../types/market';

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
}

async function handleTransaction(
  wallet: WalletAdapter,
  tx: Transaction,
  connection: Connection,
  nftAddress: string,
  ownerAddress: string,
  responseData: any
): Promise<string | null> {
  try {
    // Get a fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    // Try Phantom-specific approach first
    if (wallet.signTransaction) {
      try {
        const signedTx = await wallet.signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight: responseData.lastValidBlockHeight
        });

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
        }

        // Notify server about the pending transaction
        await notifyServer(nftAddress, signature, 'Pending');

        // Show success popup if we have breakdown data
        if (responseData.data?.breakdown) {
          showPurchaseSuccessPopup(
            'NFT Purchase',
            responseData.data.breakdown,
            signature,
            'purchase'
          );
        }

        return signature;
      } catch (phantomError) {
        console.warn('Error with Phantom-specific approach:', phantomError);
        console.log('Falling back to standard method');
      }
    }

    // Standard approach
    try {
      const signature = await wallet.sendTransaction(tx, connection);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: responseData.lastValidBlockHeight
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
      }

      // Notify server about the pending transaction
      await notifyServer(nftAddress, signature, 'Pending');

      // Show success popup if we have breakdown data
      if (responseData.data?.breakdown) {
        showPurchaseSuccessPopup(
          'NFT Purchase',
          responseData.data.breakdown,
          signature,
          'purchase'
        );
      }

      return signature;
    } catch (error) {
      console.error('Standard transaction approach failed:', error);
      throw error; // Propagate the error to be handled by the fallback mechanism
    }
  } catch (error) {
    console.error('Transaction failed:', error);
    await notifyServerTransactionFailed(nftAddress, ownerAddress);
    return null;
  }
}

async function notifyServer(nftAddress: string, signature: string, status: string): Promise<void> {
  // Implementation for server notification
  console.log(`Notifying server: NFT ${nftAddress}, signature ${signature}, status ${status}`);
}

async function notifyServerTransactionFailed(nftAddress: string, ownerAddress: string): Promise<void> {
  // Implementation for failed transaction notification
  console.log(`Notifying server of failed transaction: NFT ${nftAddress}, owner ${ownerAddress}`);
}

function showPurchaseSuccessPopup(title: string, breakdown: any, signature: string, type: string): void {
  // Implementation for success popup
  console.log(`Showing success popup: ${title}, signature ${signature}, type ${type}`);
}

export async function purchaseNFT(
  wallet: WalletAdapter,
  connection: Connection,
  nft: NFT,
  price: number
): Promise<string | null> {
  try {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Create and send the transaction
    const transaction = new Transaction();
    // Add your purchase instructions here
    // This will depend on your specific implementation

    return await handleTransaction(
      wallet,
      transaction,
      connection,
      nft.mint.toString(),
      wallet.publicKey.toString(),
      { data: { breakdown: { price } } }
    );
  } catch (error) {
    console.error('Error in purchaseNFT:', error);
    return null;
  }
} 