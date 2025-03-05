// Prepare listing request
console.log('Sending listing request to server...');

// Ensure we have valid parameters in the correct format
const requestData = {
  nftAddress: nft.mint,  // Must be a valid Solana address
  sellerAddress: wallet.publicKey.toString(),  // Must be a valid Solana address
  price: price  // Number
};

console.log('Request body:', JSON.stringify(requestData, null, 2));

const listingResponse = await fetch(`${apiBaseUrl}/api/market/listings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestData)
});

// Log response status for debugging
console.log('Response status:', listingResponse.status);

if (!listingResponse.ok) {
  const errorData = await listingResponse.json();
  console.error('Error listing NFT:', errorData);
  throw new Error(`Error listing NFT: ${JSON.stringify(errorData)}`);
} 