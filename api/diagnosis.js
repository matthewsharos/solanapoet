export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    console.log('[serverless] Diagnosis endpoint called');
    
    // Check for all environment variables
    const envVars = {
      // Google Sheets API
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? 
        { exists: true, value: maskEmail(process.env.GOOGLE_CLIENT_EMAIL) } : 
        { exists: false },
      
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 
        { 
          exists: true, 
          length: process.env.GOOGLE_PRIVATE_KEY.length,
          containsBeginEnd: process.env.GOOGLE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') && process.env.GOOGLE_PRIVATE_KEY.includes('END PRIVATE KEY'),
          containsNewlines: process.env.GOOGLE_PRIVATE_KEY.includes('\n'),
          escapedNewlines: process.env.GOOGLE_PRIVATE_KEY.includes('\\n')
        } : 
        { exists: false },
      
      GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? 
        { exists: true, value: maskValue(process.env.GOOGLE_SHEETS_SPREADSHEET_ID) } : 
        { exists: false },
      
      // Helius API
      HELIUS_API_KEY: process.env.HELIUS_API_KEY ? 
        { exists: true, value: maskValue(process.env.HELIUS_API_KEY) } : 
        { exists: false },
      
      // Solana RPC
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ? 
        { exists: true, value: maskUrl(process.env.SOLANA_RPC_URL) } : 
        { exists: false },
      
      // Google Drive
      GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID ? 
        { exists: true, value: maskValue(process.env.GOOGLE_DRIVE_FOLDER_ID) } : 
        { exists: false },
      
      // System environment
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_REGION: process.env.VERCEL_REGION,
      VERCEL_URL: process.env.VERCEL_URL
    };
    
    // Check module type
    const moduleInfo = {
      type: "ESM", // This file is using ES modules (import/export)
      jsEngine: process.version,
      platform: process.platform,
      arch: process.arch
    };
    
    // Overall status
    const status = {
      googleSheets: envVars.GOOGLE_CLIENT_EMAIL.exists && 
                   envVars.GOOGLE_PRIVATE_KEY.exists && 
                   envVars.GOOGLE_SHEETS_SPREADSHEET_ID.exists,
      
      helius: envVars.HELIUS_API_KEY.exists,
      solana: envVars.SOLANA_RPC_URL.exists,
      googleDrive: envVars.GOOGLE_DRIVE_FOLDER_ID.exists
    };
    
    // Time info for cache debugging
    const timeInfo = {
      serverTime: new Date().toISOString(),
      unixTimestamp: Date.now()
    };
    
    // Return diagnosis information
    return res.status(200).json({
      success: true,
      message: 'Diagnosis information',
      environment: envVars,
      module: moduleInfo,
      status,
      time: timeInfo
    });
  } catch (error) {
    console.error('[serverless] Error in diagnosis endpoint:', error);
    
    // Return error
    return res.status(500).json({
      success: false,
      message: 'Error during diagnosis',
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}

// Helper functions to mask sensitive values
function maskEmail(email) {
  if (!email) return null;
  const [username, domain] = email.split('@');
  return `${username.substring(0, 3)}...@${domain}`;
}

function maskValue(value) {
  if (!value) return null;
  return value.substring(0, 4) + '...' + value.substring(value.length - 2);
}

function maskUrl(url) {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.hostname}/...`;
  } catch (e) {
    return url.substring(0, 8) + '...';
  }
} 