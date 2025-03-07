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
    // Check for required environment variables
    const hasHeliusApiKey = !!process.env.HELIUS_API_KEY;
    const hasSolanaRpcUrl = !!process.env.SOLANA_RPC_URL;
    const hasGoogleCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const hasSpreadsheetId = !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
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
      serverless: true
    });
  } catch (error) {
    console.error('[serverless] Error in config endpoint:', error);
    
    return res.status(500).json({
      hasGoogleCredentials: false,
      hasSpreadsheetId: false,
      hasHeliusApiKey: false,
      hasSolanaRpcUrl: false,
      isConfigured: false,
      serverless: true,
      error: {
        code: 'CONFIG_ERROR',
        message: error instanceof Error ? error.message : 'Error retrieving configuration'
      }
    });
  }
}; 