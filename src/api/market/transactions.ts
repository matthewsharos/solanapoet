import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { WalletInterface } from '../../types/common';
import { NFT, NFTListing, PurchaseDetails } from '../../types/market';
import { sendTransactionWithRetry } from '../../utils/solana';
import { showTransactionNotification, showErrorNotification } from '../../utils/notifications';

export async function listNFT(
  wallet: WalletInterface,
  connection: Connection,
  nft: NFT,
  price: number
): Promise<boolean> {
  try {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Create listing transaction
    const transaction = new Transaction();
    // Add your listing instructions here
    // This will depend on your specific marketplace implementation

    const result = await sendTransactionWithRetry(wallet, connection, transaction);

    if (result.success) {
      showTransactionNotification(
        result.signature,
        `Successfully listed ${nft.name} for ${price} SOL`
      );
      return true;
    } else {
      throw result.error || new Error('Failed to list NFT');
    }
  } catch (error) {
    showErrorNotification(error as Error);
    return false;
  }
}

export async function purchaseNFT(
  wallet: WalletInterface,
  connection: Connection,
  listing: NFTListing
): Promise<PurchaseDetails | null> {
  try {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Create purchase transaction
    const transaction = new Transaction();
    // Add your purchase instructions here
    // This will depend on your specific marketplace implementation

    const result = await sendTransactionWithRetry(wallet, connection, transaction);

    if (result.success) {
      const purchaseDetails: PurchaseDetails = {
        nft: listing.nft,
        price: listing.price,
        seller: listing.seller,
        buyer: wallet.publicKey,
        timestamp: Date.now()
      };

      showTransactionNotification(
        result.signature,
        `Successfully purchased ${listing.nft.name} for ${listing.price} SOL`
      );

      return purchaseDetails;
    } else {
      throw result.error || new Error('Failed to purchase NFT');
    }
  } catch (error) {
    showErrorNotification(error as Error);
    return null;
  }
}

export async function cancelListing(
  wallet: WalletInterface,
  connection: Connection,
  listing: NFTListing
): Promise<boolean> {
  try {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Create cancel listing transaction
    const transaction = new Transaction();
    // Add your cancel listing instructions here
    // This will depend on your specific marketplace implementation

    const result = await sendTransactionWithRetry(wallet, connection, transaction);

    if (result.success) {
      showTransactionNotification(
        result.signature,
        `Successfully cancelled listing for ${listing.nft.name}`
      );
      return true;
    } else {
      throw result.error || new Error('Failed to cancel listing');
    }
  } catch (error) {
    showErrorNotification(error as Error);
    return false;
  }
} 