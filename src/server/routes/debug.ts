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
      prefix: value ? value.substring(0, Math.min(4, value.length)) : null,
      isDefined: name in process.env
    };
  } catch (error) {
    console.error(`Error getting env var info for ${name}:`, error);
    return {
      exists: false,
      error: 'Error accessing variable'
    };
  }
};

// Debug API route to check environment variables and server status
router.get('/', async (_req: Request, res: Response) => {
  try {
    console.log('Debug endpoint called');
    
    // Basic environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV || 'Not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'Not set',
      VERCEL_URL: process.env.VERCEL_URL || 'Not set'
    };

    console.log('Environment info:', envInfo);

    // Google credentials info (safely)
    const googleInfo = {
      GOOGLE_CLIENT_EMAIL: getEnvVarInfo('GOOGLE_CLIENT_EMAIL'),
      GOOGLE_PRIVATE_KEY: getEnvVarInfo('GOOGLE_PRIVATE_KEY'),
      GOOGLE_SHEETS_SPREADSHEET_ID: getEnvVarInfo('GOOGLE_SHEETS_SPREADSHEET_ID')
    };

    // Helius info (safely)
    const heliusInfo = {
      HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
      VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY'),
      SOLANA_RPC_URL: getEnvVarInfo('SOLANA_RPC_URL'),
      VITE_SOLANA_RPC_URL: getEnvVarInfo('VITE_SOLANA_RPC_URL')
    };

    const response = {
      status: 'ok',
      time: new Date().toISOString(),
      environment: envInfo,
      google: googleInfo,
      helius: heliusInfo
    };

    console.log('Debug response prepared successfully');
    return res.json(response);
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Unknown error occurred',
      type: error?.constructor?.name || 'Unknown',
      time: new Date().toISOString()
    });
  }
});

// Simple Helius key check
router.get('/helius-check', async (_req: Request, res: Response) => {
  try {
    console.log('Helius check endpoint called');
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    const response = {
      success: true,
      keyInfo: {
        exists: !!heliusApiKey,
        length: heliusApiKey?.length || 0,
        prefix: heliusApiKey ? heliusApiKey.substring(0, Math.min(4, heliusApiKey.length)) : null
      },
      environment: {
        HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
        VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY')
      }
    };

    console.log('Helius check response:', JSON.stringify(response, null, 2));
    return res.json(response);
  } catch (error: any) {
    console.error('Error in helius-check endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
      type: error?.constructor?.name || 'Unknown'
    });
  }
});

// Test Helius API connection
router.get('/helius-test', async (_req: Request, res: Response) => {
  try {
    console.log('Helius test endpoint called');
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    
    if (!heliusApiKey) {
      console.log('No Helius API key found');
      return res.status(400).json({
        success: false,
        message: 'No Helius API key found',
        environment: {
          HELIUS_API_KEY: getEnvVarInfo('HELIUS_API_KEY'),
          VITE_HELIUS_API_KEY: getEnvVarInfo('VITE_HELIUS_API_KEY')
        }
      });
    }

    console.log('Testing Helius API connection...');
    
    // Test with a simple getHealth request first
    const healthResponse = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      {
        jsonrpc: '2.0',
        id: 'helius-test',
        method: 'getHealth'
      },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Health check response:', healthResponse.data);

    return res.json({
      success: true,
      keyInfo: {
        prefix: heliusApiKey.substring(0, Math.min(4, heliusApiKey.length)),
        length: heliusApiKey.length
      },
      apiResponse: {
        status: healthResponse.status,
        data: healthResponse.data
      }
    });
  } catch (error: any) {
    console.error('Error in helius-test endpoint:', {
      message: error.message,
      type: error?.constructor?.name,
      response: {
        status: error.response?.status,
        data: error.response?.data
      }
    });

    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred',
      type: error?.constructor?.name || 'Unknown',
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : undefined
    });
  }
});

// Add a route to list all registered routes
router.get('/routes', (req: Request, res: Response) => {
  const app = req.app;
  const routes: any[] = [];

  // Helper function to get all express routes
  function print(path: string, layer: any) {
    if (layer.route) {
      layer.route.stack.forEach((stack: any) => {
        routes.push({
          path: path + layer.route.path,
          method: stack.method.toUpperCase()
        });
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach((stack: any) => {
        print(path + layer.regexp.source.replace('^\\/','').replace('\\/?(?=\\/|$)', ''), stack);
      });
    }
  }

  // Get all registered routes
  if (app._router && app._router.stack) {
    app._router.stack.forEach((layer: any) => {
      print('', layer);
    });
  }

  res.json({
    success: true,
    routes: routes.filter(r => r.path.startsWith('/api')).sort((a, b) => a.path.localeCompare(b.path))
  });
});

// Add a route to check Helius API key configuration
router.get('/helius-config', (req: Request, res: Response) => {
  const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
  
  res.json({
    success: true,
    config: {
      hasHeliusApiKey: !!heliusApiKey,
      keyPrefix: heliusApiKey ? heliusApiKey.substring(0, 4) + '...' : null,
      keyLength: heliusApiKey ? heliusApiKey.length : 0,
      isValidFormat: heliusApiKey ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(heliusApiKey) : false
    }
  });
});

// Add a basic health check endpoint
router.get('/api-check', (req: Request, res: Response) => {
  const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
  
  res.json({
    success: true,
    message: 'Express API is working correctly',
    timestamp: new Date().toISOString(),
    request: {
      url: req.originalUrl,
      method: req.method,
      host: req.headers.host,
      path: req.path
    },
    env: {
      node_env: process.env.NODE_ENV,
      has_helius_key: !!heliusApiKey,
      helius_key_length: heliusApiKey ? heliusApiKey.length : 0
    }
  });
});

export default router; 