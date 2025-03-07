// Serverless function for configuration endpoint
module.exports = async (req, res) => {
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
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }
  
  try {
    // Safely check for environment variables
    let hasHeliusApiKey = false;
    let hasSolanaRpcUrl = false;
    let hasGoogleCredentials = false;
    let hasSpreadsheetId = false;
    
    try {
      hasHeliusApiKey = !!process.env.HELIUS_API_KEY;
    } catch (e) {
      console.error('[serverless] Error checking HELIUS_API_KEY:', e);
    }
    
    try {
      hasSolanaRpcUrl = !!process.env.SOLANA_RPC_URL;
    } catch (e) {
      console.error('[serverless] Error checking SOLANA_RPC_URL:', e);
    }
    
    try {
      hasGoogleCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    } catch (e) {
      console.error('[serverless] Error checking GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
    }
    
    try {
      hasSpreadsheetId = !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    } catch (e) {
      console.error('[serverless] Error checking GOOGLE_SHEETS_SPREADSHEET_ID:', e);
    }
    
    // Return config information
    return res.status(200).json({
      hasGoogleCredentials: hasGoogleCredentials,
      hasSpreadsheetId: hasSpreadsheetId,
      hasHeliusApiKey: hasHeliusApiKey,
      hasSolanaRpcUrl: hasSolanaRpcUrl,
      isConfigured: hasHeliusApiKey && hasSolanaRpcUrl,
      HELIUS_API_KEY: hasHeliusApiKey ? process.env.HELIUS_API_KEY.substring(0, 4) + '...' : null,
      SOLANA_RPC_URL: hasSolanaRpcUrl ? process.env.SOLANA_RPC_URL : null,
      environment: process.env.NODE_ENV || 'production',
      serverless: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[serverless] Error in config endpoint:', error);
    
    // Provide a more resilient response
    return res.status(200).json({
      hasGoogleCredentials: false,
      hasSpreadsheetId: false,
      hasHeliusApiKey: false,
      hasSolanaRpcUrl: false,
      isConfigured: false,
      serverless: true,
      timestamp: new Date().toISOString(),
      troubleshooting: {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : null,
        vercelEnv: process.env.VERCEL_ENV || 'unknown'
      }
    });
  }
}; 