import express, { Request, Response } from 'express';
import axios from 'axios';

const router = express.Router();

// Debug API route to check environment variables and server status
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('Debug API route called');

    const envInfo = {
      GOOGLE_CLIENT_EMAIL_exists: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_CLIENT_EMAIL_length: process.env.GOOGLE_CLIENT_EMAIL?.length,
      GOOGLE_PRIVATE_KEY_exists: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_length: process.env.GOOGLE_PRIVATE_KEY?.length,
      GOOGLE_PRIVATE_KEY_starts: process.env.GOOGLE_PRIVATE_KEY?.substring(0, 27),
      GOOGLE_PRIVATE_KEY_has_newlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\\n'),
      GOOGLE_PRIVATE_KEY_has_real_newlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\n'),
      GOOGLE_SHEETS_SPREADSHEET_ID_exists: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 'Not set',
      NODE_ENV: process.env.NODE_ENV || 'Not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'Not set',
      VERCEL_URL: process.env.VERCEL_URL || 'Not set',
      HELIUS_API_KEY_exists: !!process.env.HELIUS_API_KEY,
      VITE_HELIUS_API_KEY_exists: !!process.env.VITE_HELIUS_API_KEY,
      HELIUS_API_KEY_prefix: process.env.HELIUS_API_KEY ? process.env.HELIUS_API_KEY.substring(0, 4) : null,
      VITE_HELIUS_API_KEY_prefix: process.env.VITE_HELIUS_API_KEY ? process.env.VITE_HELIUS_API_KEY.substring(0, 4) : null,
      SOLANA_RPC_URL_exists: !!process.env.SOLANA_RPC_URL,
      VITE_SOLANA_RPC_URL_exists: !!process.env.VITE_SOLANA_RPC_URL
    };

    // Test Helius API if key exists
    let heliusTest = null;
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    if (heliusApiKey) {
      try {
        const testMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint
        const response = await axios.post(
          `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
          {
            jsonrpc: '2.0',
            id: 'debug-test',
            method: 'getAsset',
            params: {
              id: testMint
            }
          },
          { timeout: 5000 }
        );
        
        heliusTest = {
          success: true,
          responseStatus: response.status,
          hasData: !!response.data,
          hasResult: !!response.data?.result
        };
      } catch (heliusError: any) {
        heliusTest = {
          success: false,
          error: heliusError.message,
          responseStatus: heliusError.response?.status,
          responseData: heliusError.response?.data
        };
      }
    }

    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString(),
      environment: envInfo,
      heliusTest
    });
  } catch (error: any) {
    console.error('Debug API route error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router; 