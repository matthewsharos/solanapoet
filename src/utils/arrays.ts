/**
 * Splits an array into chunks of the specified size
 * @param arr The array to split
 * @param size The size of each chunk
 * @returns An array of arrays, each of size 'size'
 */
export const chunk = <T,>(arr: T[], size: number): T[][] => {
  if (!arr.length) return [];
  
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  
  return chunks;
}; 