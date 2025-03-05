/**
 * This file contains callback functions for purchase-related events
 */

// Callback for purchase success popup
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

/**
 * Calls the purchase success popup callback if it exists
 * @param nftName The name of the NFT that was purchased
 * @param breakdown The breakdown of the purchase price
 * @param signature The transaction signature
 */
export const callPurchaseSuccessPopupCallback = (
  nftName: string,
  breakdown: any,
  signature: string
): void => {
  if (purchaseSuccessPopupCallback) {
    purchaseSuccessPopupCallback(nftName, breakdown, signature);
  }
}; 