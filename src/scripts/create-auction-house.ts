import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { mplAuctionHouse } from '@metaplex-foundation/mpl-auction-house';
import { publicKey } from '@metaplex-foundation/umi';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Initialize UMI
  const umi = createUmi('https://api.devnet.solana.com')
    .use(mplAuctionHouse());

  // Load wallet keypair
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('/Users/degenpoet/.config/solana/id.json', 'utf-8')));
  const web3Keypair = Keypair.fromSecretKey(secretKey);
  const keypair = fromWeb3JsKeypair(web3Keypair);
  umi.identity = keypair;
  umi.payer = keypair;

  try {
    // Create auction house
    const { auctionHouse } = await umi.rpc.createAuctionHouse({
      sellerFeeBasisPoints: 200, // 2%
      requiresSignOff: false,
      canChangeSalePrice: false,
      treasuryMint: publicKey('So11111111111111111111111111111111111111112'), // SOL mint
      feeWithdrawalDestination: keypair.publicKey,
      treasuryWithdrawalDestination: keypair.publicKey,
      authority: keypair.publicKey,
    });

    // Ensure the config directory exists
    const configDir = './src/config';
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save auction house address and config
    const configPath = path.join(configDir, 'auction-house.json');
    fs.writeFileSync(configPath, JSON.stringify({
      address: auctionHouse.publicKey.toString(),
      sellerFeeBasisPoints: 200,
      requiresSignOff: false,
      canChangeSalePrice: false,
      treasuryMint: 'So11111111111111111111111111111111111111112',
      authority: keypair.publicKey.toString(),
    }, null, 2));

    console.log('Auction house created successfully!');
    console.log('Address:', auctionHouse.publicKey.toString());
  } catch (error) {
    console.error('Failed to create auction house:', error);
    process.exit(1);
  }
}

main();

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 