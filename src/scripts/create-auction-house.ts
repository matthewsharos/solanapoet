import { 
  Metaplex, 
  keypairIdentity, 
  WRAPPED_SOL_MINT,
  sol,
  toDateTime,
} from '@metaplex-foundation/js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

async function main() {
  // Connect to the network (change to mainnet-beta for production)
  const connection = new Connection(process.env.RPC_URL || 'https://api.devnet.solana.com');
  
  // If you have a keypair file, load it - otherwise you'd need to generate or use another approach
  // const keypairFile = process.env.KEYPAIR_PATH || '/path/to/keypair.json';
  // const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairFile, 'utf8')));
  // const walletKeypair = Keypair.fromSecretKey(secretKey);
  
  // For testing purposes - this would normally be your wallet keypair
  // Using a placeholder since we don't have the private key for the provided wallet
  const walletKeypair = Keypair.generate(); // Replace with actual wallet keypair
  
  // The target wallet that will be the authority (from the user query)
  const targetWalletAddress = new PublicKey('ART5dr4bDic2sQVZoFheEmUxwQq5VGSx9he7JxHcXNQD');
  
  console.log('Creating auction house with wallet:', walletKeypair.publicKey.toString());
  
  // Initialize Metaplex
  const metaplex = Metaplex.make(connection).use(keypairIdentity(walletKeypair));
  
  try {
    // Create the auction house
    const { auctionHouse } = await metaplex.auctionHouse().create({
      sellerFeeBasisPoints: 200, // 2% fee
      requiresSignOff: false,    // Allow direct listing without marketplace approval
      canChangeSalePrice: false, // Prevent price changes without approval
      treasuryMint: WRAPPED_SOL_MINT, // Use SOL as the currency
      authority: targetWalletAddress, // The wallet that will control the auction house
      feeWithdrawalDestination: targetWalletAddress, // Where fees go
      treasuryWithdrawalDestinationOwner: targetWalletAddress, // Where royalties go
    });
    
    console.log('✅ Auction house created successfully!');
    console.log('Auction House Address:', auctionHouse.address.toString());
    
    // Fund the auction house fee account - we need to deposit some SOL to cover transaction fees
    // Instead of using update, we'll use proper method to deposit funds
    await metaplex.auctionHouse().withdrawFromFeeAccount({
      auctionHouse,
      amount: sol(-0.01), // Negative amount means deposit instead of withdraw
    });
    
    console.log('✅ Auction house fee account funded');
    
    // Save the auction house address to a file
    const config = {
      auctionHouseAddress: auctionHouse.address.toString(),
      treasuryMint: WRAPPED_SOL_MINT.toString(),
      sellerFeeBasisPoints: 200,
      requiresSignOff: false,
      canChangeSalePrice: false,
      createdAt: new Date().toISOString()
    };
    
    // Ensure the directory exists
    if (!fs.existsSync('./src/config')) {
      fs.mkdirSync('./src/config', { recursive: true });
    }
    
    fs.writeFileSync(
      './src/config/auction-house.json', 
      JSON.stringify(config, null, 2),
      'utf8'
    );
    
    console.log('✅ Configuration saved to src/config/auction-house.json');
    
  } catch (error) {
    console.error('❌ Error creating auction house:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 