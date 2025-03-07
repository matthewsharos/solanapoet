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
    // Check environment and configuration
    const heliusApiKey = process.env.HELIUS_API_KEY || process.env.VITE_HELIUS_API_KEY;
    const googleCredentials = {
      hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    };

    // Perform basic connectivity checks
    const checks = {
      helius: {
        configured: !!heliusApiKey,
        status: 'unknown'
      },
      googleSheets: {
        configured: Object.values(googleCredentials).every(Boolean),
        status: 'unknown'
      }
    };

    // Check Helius API connectivity
    if (checks.helius.configured) {
      try {
        const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        const response = await fetch(HELIUS_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'health-check',
            method: 'getHealth',
            params: []
          })
        });
        checks.helius.status = response.ok ? 'healthy' : 'error';
      } catch (error) {
        checks.helius.status = 'error';
        checks.helius.error = error.message;
      }
    }

    // Check Google Sheets API connectivity
    if (checks.googleSheets.configured) {
      try {
        const { google } = await import('googleapis');
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        await auth.getClient();
        checks.googleSheets.status = 'healthy';
      } catch (error) {
        checks.googleSheets.status = 'error';
        checks.googleSheets.error = error.message;
      }
    }

    // Return health status
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION,
      },
      services: checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: {
        node: process.version,
        dependencies: {
          googleapis: 'latest',
          axios: 'latest'
        }
      }
    });

  } catch (error) {
    console.error('[health] Error in health check endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
      error: {
        type: error.name,
        stack: error.stack,
        code: error.code
      }
    });
  }
} 