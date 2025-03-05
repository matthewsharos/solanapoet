/**
 * Formats a wallet address to display a shortened version with ellipsis
 * @param address The full wallet address
 * @param prefixLength Number of characters to show at the beginning
 * @param suffixLength Number of characters to show at the end
 * @returns Formatted address string
 */
export const formatWalletAddress = (
  address: string, 
  prefixLength: number = 4, 
  suffixLength: number = 4
): string => {
  if (!address) return '';
  
  if (address.length <= prefixLength + suffixLength) {
    return address;
  }
  
  const prefix = address.slice(0, prefixLength);
  const suffix = address.slice(-suffixLength);
  
  return `${prefix}...${suffix}`;
}; 