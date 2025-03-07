// Serverless function for configuration endpoint
module.exports = async (req, res) => {
  try {
    console.log('[serverless] Config endpoint called');
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(200).json({
        success: false,
        message: 'Method not allowed'
      });
    }
    
    console.log('[serverless] Checking environment variables...');
    
    // Get all environment variables safely with fallbacks
    const envVars = {
      HELIUS_API_KEY: process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY || '',
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL || '',
      GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
      GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || '',
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || '',
      NODE_ENV: process.env.NODE_ENV || 'production',
      VERCEL_ENV: process.env.VERCEL_ENV || 'unknown'
    };

    console.log('[serverless] Environment variables loaded');
    
    // Check for presence of required variables
    const hasHeliusApiKey = !!envVars.HELIUS_API_KEY;
    const hasSolanaRpcUrl = !!envVars.SOLANA_RPC_URL;
    const hasGoogleDriveFolderId = !!envVars.GOOGLE_DRIVE_FOLDER_ID;
    const hasSpreadsheetId = !!envVars.GOOGLE_SHEETS_SPREADSHEET_ID;
    const hasGooglePrivateKey = !!envVars.GOOGLE_PRIVATE_KEY;
    const hasGoogleClientEmail = !!envVars.GOOGLE_CLIENT_EMAIL;
    
    // Check if Google credentials are complete
    const hasGoogleCredentials = hasGooglePrivateKey && hasGoogleClientEmail;

    console.log('[serverless] Environment checks completed');
    
    // Return config information with debugging details
    return res.status(200).json({
      success: true,
      hasHeliusApiKey,
      hasSolanaRpcUrl,
      hasGoogleDriveFolderId,
      hasSpreadsheetId,
      hasGoogleCredentials,
      isConfigured: hasHeliusApiKey && hasSolanaRpcUrl && hasGoogleCredentials && hasSpreadsheetId,
      environment: envVars.NODE_ENV,
      vercelEnv: envVars.VERCEL_ENV,
      serverless: true,
      timestamp: new Date().toISOString(),
      debug: {
        envKeys: Object.keys(process.env),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        googleAuth: {
          hasPrivateKey: hasGooglePrivateKey,
          hasClientEmail: hasGoogleClientEmail,
          privateKeyLength: hasGooglePrivateKey ? envVars.GOOGLE_PRIVATE_KEY.length : 0,
          clientEmailMask: hasGoogleClientEmail ? 
            envVars.GOOGLE_CLIENT_EMAIL.replace(/^(.{4}).*(@.*)$/, '$1...$2') : null
        },
        heliusApiKeyMask: hasHeliusApiKey ? envVars.HELIUS_API_KEY.substring(0, 4) + '...' : null,
        solanaRpcUrlMask: hasSolanaRpcUrl ? envVars.SOLANA_RPC_URL.replace(/^(https?:\/\/[^\/]+).*$/, '$1/...') : null,
        googleDriveFolderIdMask: hasGoogleDriveFolderId ? envVars.GOOGLE_DRIVE_FOLDER_ID.substring(0, 4) + '...' : null,
        spreadsheetIdMask: hasSpreadsheetId ? envVars.GOOGLE_SHEETS_SPREADSHEET_ID.substring(0, 4) + '...' : null,
        processEnv: {
          NODE_ENV: process.env.NODE_ENV,
          VERCEL_ENV: process.env.VERCEL_ENV,
          VERCEL_REGION: process.env.VERCEL_REGION,
          VERCEL_URL: process.env.VERCEL_URL
        }
      }
    });
  } catch (error) {
    console.error('[serverless] Error in config endpoint:', error);
    
    // Return error response with debugging information
    return res.status(200).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      error: {
        stack: error instanceof Error ? error.stack : null,
        vercelEnv: process.env.VERCEL_ENV || 'unknown',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        envKeys: Object.keys(process.env),
        processEnv: {
          NODE_ENV: process.env.NODE_ENV,
          VERCEL_ENV: process.env.VERCEL_ENV,
          VERCEL_REGION: process.env.VERCEL_REGION,
          VERCEL_URL: process.env.VERCEL_URL
        }
      }
    });
  }
}; 