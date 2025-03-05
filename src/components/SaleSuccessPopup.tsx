import React from 'react';

interface SaleBreakdown {
  totalPrice: number;
  royaltyPercentage: number;
  royaltyAmount: number;
  sellerAmount: number;
  creatorAddress?: string;
  transactionId?: string;
}

interface SaleSuccessPopupProps {
  isOpen: boolean;
  onClose: () => void;
  nftName?: string;
  breakdown: SaleBreakdown;
}

const SaleSuccessPopup: React.FC<SaleSuccessPopupProps> = ({ 
  isOpen, 
  onClose, 
  nftName = 'NFT',
  breakdown 
}) => {
  if (!isOpen) return null;

  const explorerUrl = breakdown.transactionId 
    ? `https://explorer.solana.com/tx/${breakdown.transactionId}?cluster=mainnet` 
    : undefined;

  // Truncate transaction ID for more compact display
  const truncatedTxId = breakdown.transactionId 
    ? `${breakdown.transactionId.substring(0, 8)}...${breakdown.transactionId.substring(breakdown.transactionId.length - 8)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="bg-white dark:bg-gray-800 w-full max-w-xs p-4 rounded-lg shadow-lg relative z-10">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Purchase Successful!</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-3">
          <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-2">
            🎉 Congratulations! You've purchased {nftName}!
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md text-sm">
            <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-white">Payment Details</h3>
            
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Total:</span>
                <span className="font-medium text-gray-900 dark:text-white">{breakdown.totalPrice} SOL</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">
                  Royalties ({breakdown.royaltyPercentage}%):
                </span>
                <span className="font-medium text-gray-900 dark:text-white">{breakdown.royaltyAmount} SOL</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">To Seller:</span>
                <span className="font-medium text-gray-900 dark:text-white">{breakdown.sellerAmount} SOL</span>
              </div>
              
              {breakdown.transactionId && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t">
                  <a 
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title={breakdown.transactionId}
                  >
                    <span>View on Solana Explorer</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleSuccessPopup; 