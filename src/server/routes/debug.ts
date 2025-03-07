import express, { Request, Response } from 'express';
import axios from 'axios';

const router = express.Router();

// Helper function to safely get environment variable info
const getEnvVarInfo = (name: string) => {
  try {
    const value = process.env[name];
    return {
      exists: !!value,
      length: value?.length || 0,
      prefix: value ? value.substring(0, 4) : null,
      isDefined: name in process.env
    };
  } catch (error) {
    return {
      exists: false,
      error: 'Error accessing variable'
    };
  }
};

// Debug API route to check environment variables and server status
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Basic environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV || 'Not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'Not set',
      VERCEL_URL: process.env.VERCEL_URL || 'Not set'
    };

    // Google credentials info
    const googleInfo = {
      GOOGLE_CLIENT_EMAIL: getEnvVarInfo('GOOGLE_CLIENT_EMAIL'),
      GOOGLE_PRIVATE_KEY: getEnvVarInfo('GOOGLE_PRIVATE_KEY'),
      GOOGLE_SHEETS_SPREADSHEET_ID: getEnvVarInfo('GOOGLE_SHEETS_SPREADSHEET_ID')
    };

    // Helius info
    const heliusInfo = {
      HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
      VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY'),
      SOLANA_RPC_URL: getEnvVarInfo('SOLANA_RPC_URL'),
      VITE_SOLANA_RPC_URL: getEnvVarInfo('VITE_SOLANA_RPC_URL')
    };

    return res.json({
      status: 'ok',
      time: new Date().toISOString(),
      environment: envInfo,
      google: googleInfo,
      helius: heliusInfo
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
      type: error.constructor.name,
      time: new Date().toISOString()
    });
  }
});

// Simple Helius key check
router.get('/helius-check', async (_req: Request, res: Response) => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    // Basic check without making API call
    return res.json({
      success: true,
      keyInfo: {
        exists: !!heliusApiKey,
        length: heliusApiKey?.length || 0,
        prefix: heliusApiKey ? heliusApiKey.substring(0, 4) : null
      },
      environment: {
        HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
        VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY')
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name
    });
  }
});

// Test Helius API connection
router.get('/helius-test', async (_req: Request, res: Response) => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    if (!heliusApiKey) {
      return res.status(400).json({
        success: false,
        message: 'No Helius API key found',
        environment: {
          HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
          VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY')
        }
      });
    }

    // Test mint address (USDC)
    const testMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    
    // Create an axios instance with timeout
    const heliusClient = axios.create({
      timeout: 5000 // 5 second timeout
    });

    const response = await heliusClient.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-test',
        method: 'getAsset',
        params: {
          id: testMint
        }
      }
    );

    return res.json({
      success: true,
      keyInfo: {
        prefix: heliusApiKey.substring(0, 4),
        length: heliusApiKey.length
      },
      apiResponse: {
        status: response.status,
        hasData: !!response.data,
        hasResult: !!response.data?.result
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name,
      response: {
        status: error.response?.status,
        data: error.response?.data
      }
    });
  }
});

export default router; 