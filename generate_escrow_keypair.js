import { PublicKey, Keypair } from '@solana/web3.js';
import { writeFileSync } from 'fs';

function deriveEscrowKeypair(nftMint) {
  const marketplaceAuthority = 'C4JWRGv7hoSsf6hEnNajMhgCSrsunXa3jtc3NQZ4kGco';
  
  const seed = Buffer.concat([
    new PublicKey(marketplaceAuthority).toBuffer(),
    new PublicKey(nftMint).toBuffer()
  ]);
  return Keypair.fromSeed(seed.slice(0, 32));
}

const nftMint = 'GzftARJQUTd6eWdkk2mWarr3ygPPAvQ9R3gmjkEjbXtp';
const escrowKeypair = deriveEscrowKeypair(nftMint);

// Save the keypair to a file in the correct format
writeFileSync('derived_escrow_keypair.json', JSON.stringify(Array.from(escrowKeypair.secretKey)));

console.log('Escrow public key:', escrowKeypair.publicKey.toString());
console.log('Keypair saved to derived_escrow_keypair.json'); 