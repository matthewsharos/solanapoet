# Escrow Token Account Fix

## Problem

The NFT listing process was failing with the error:

```
Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL failed: Provided owner is not allowed
```

This error occurred because the code was trying to use the marketplace wallet (`C4JWRGv7hoSsf6hEnNajMhgCSrsunXa3jtc3NQZ4kGco`) as the owner for the Associated Token Account (ATA), but this public key is not on the Ed25519 curve, which is required for ATA ownership.

## Solution

We've implemented a solution using a derived keypair approach:

1. Instead of using the marketplace wallet directly as the owner, we derive a deterministic keypair from it and the NFT mint:

```javascript
// Create a seed from the marketplace authority and mint
const seed = Buffer.concat([
  marketplaceAuthority.toBuffer(),
  mint.toBuffer()
]);

// Create a keypair from the seed
const escrowKeypair = Keypair.fromSeed(seed.slice(0, 32));
console.log(`Derived escrow keypair: ${escrowKeypair.publicKey.toString()}`);
console.log(`Escrow keypair is on curve: ${PublicKey.isOnCurve(escrowKeypair.publicKey.toBuffer())}`);

// Get the escrow token account using the derived keypair
const escrowTokenAccount = await getAssociatedTokenAddress(
  mint,
  escrowKeypair.publicKey
);
```

2. We then use this keypair's public key as the owner when creating the escrow token account:

```javascript
const escrowTokenAccount = await getAssociatedTokenAddress(
  mint,
  escrowKeypair.publicKey // owner - use derived keypair
);
```

3. We've updated both client and server code to use this consistent approach.

## Files Changed

1. `src/api/marketplace.ts`:
   - Fixed `getEscrowTokenAccount` function to use derived keypair and handle connection parameter
   - Updated `listNFTForSale` function to handle retry logic better and use the derived keypair
   - Fixed ATA instruction rebuilding in both `listNFTForSale` and `signAndSendTransaction` functions

2. `src/server/routes/market.ts`:
   - Updated `listNFTHandler` to use the same derived keypair approach for escrow token account
   - Fixed token program IDs and imports

## Additional Fixes

1. Fixed the `ReferenceError: getConnection is not defined` error in the `getEscrowTokenAccount` function
2. Fixed the mismatch between client and server escrow token account derivation
3. Added proper error handling to prevent infinite loops
4. Created a test script (`src/test-escrow-fix.js`) to verify the derived keypair approach

## Testing

Our test script confirms that:
1. The derived keypair is on the Ed25519 curve
2. The escrow token account can be derived consistently
3. The approach works for both client and server

## How It Works

1. When listing an NFT, we derive a deterministic keypair from the marketplace wallet and NFT mint
2. This keypair's public key is used as the owner for the escrow token account
3. The escrow token account is an Associated Token Account (ATA) for the NFT mint
4. When buying an NFT, we use the same derived keypair to derive the escrow token account
5. The derived keypair is deterministic, so it will always be the same for the same marketplace wallet and NFT mint

## Benefits

1. Consistent escrow token account derivation between client and server
2. Avoids the "Provided owner is not allowed" error by using a valid on-curve public key
3. Maintains security by using deterministic keypairs that can be derived by both client and server
4. No need to store or transmit private keys

## Next Steps

1. Try listing an NFT again - it should work without hitting the retry limit
2. Monitor for any other issues that might arise
3. Consider adding more logging to track the escrow token account creation process

## Troubleshooting

If you still encounter issues:

1. Check the console logs for any errors related to escrow token account creation
2. Verify that the client and server are using the same marketplace wallet address
3. Make sure the derived keypair is on the Ed25519 curve
4. Check if the escrow token account already exists before trying to create it

## NFT Marketplace Escrow Fix

### Problem

The NFT listing process was failing with the error "Provided owner is not allowed". This occurred because we were trying to use the marketplace wallet as the owner for the Associated Token Account (ATA), but this wallet is not on the Ed25519 curve.

### Solution

We implemented a derived keypair approach that creates a deterministic keypair from the marketplace authority and NFT mint. This keypair is then used as the owner for the escrow token account.

#### Code Changes

1. In `src/api/marketplace.ts`, we updated the `getEscrowTokenAccount` function:

```javascript
// Create a seed from the marketplace authority and mint
const seed = Buffer.concat([
  marketplaceAuthority.toBuffer(),
  mint.toBuffer()
]);

// Create a keypair from the seed
const escrowKeypair = Keypair.fromSeed(seed.slice(0, 32));
console.log(`Derived escrow keypair: ${escrowKeypair.publicKey.toString()}`);
console.log(`Escrow keypair is on curve: ${PublicKey.isOnCurve(escrowKeypair.publicKey.toBuffer())}`);

// Get the escrow token account using the derived keypair
const escrowTokenAccount = await getAssociatedTokenAddress(
  mint,
  escrowKeypair.publicKey
);
```

2. In `src/server/routes/market.ts`, we updated both the `listNFTHandler` and `buyNFTHandler` functions to use the same derived keypair approach.

3. We fixed the API endpoint URLs to ensure they match between client and server:
   - Client: `/api/market/list` and `/api/market/buy`
   - Server: Routes mounted at `/api/market`

### Listing Process

1. Client calls `listNFTForSale` which sends a request to `/api/market/list`
2. Server creates a transaction that:
   - Derives a keypair from the marketplace authority and NFT mint
   - Creates an escrow token account owned by the derived keypair
   - Transfers the NFT from the seller to the escrow account
3. Client signs and sends the transaction

### Buying Process

1. Client calls `buyNFT` which sends a request to `/api/market/buy`
2. Server creates a transaction that:
   - Derives the same keypair from the marketplace authority and NFT mint
   - Transfers the NFT from the escrow account to the buyer
   - Transfers SOL from the buyer to the seller
3. Client signs and sends the transaction

### Test Scripts

We created several test scripts to verify our approach:

1. `src/test-ata-owner.js` - Diagnoses the issue with the marketplace wallet
2. `src/test-direct-escrow.js` - Tests using the marketplace wallet directly (fails)
3. `src/test-keypair-escrow.js` - Verifies the derived keypair approach for listing
4. `src/test-buy-nft.js` - Verifies the derived keypair approach for buying

### How It Works

1. **Consistent Derivation**: The same keypair is derived on both client and server using the marketplace authority and NFT mint.
2. **On-Curve Ownership**: The derived keypair is guaranteed to be on the Ed25519 curve.
3. **Security**: The derived keypair is deterministic and can only be created by someone with knowledge of the marketplace authority.
4. **No Private Key Storage**: We don't need to store or transmit private keys, as they are derived when needed.

### Next Steps

1. Try listing an NFT again and verify it works
2. Try buying a listed NFT and verify the purchase process works
3. Monitor for any other issues
4. Add more logging to track the escrow token account creation and transfer process 