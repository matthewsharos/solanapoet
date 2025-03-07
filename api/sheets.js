// Serverless function handler for Google Sheets API
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
  
  try {
    // Get the requested sheet name from the URL path or query parameter
    const sheetName = req.query.sheet || 
                     (req.url.match(/\/api\/sheets\/([^\/\?]+)/) || [])[1] || 
                     'unknown';
    
    console.log(`[serverless] Sheets API called for sheet: ${sheetName}`);
    
    // Return empty data based on sheet type
    let data = [];
    
    if (sheetName === 'display_names') {
      data = []; // Empty display names
    } else if (sheetName === 'collections') {
      data = []; // Empty collections
    } else if (sheetName === 'ultimates') {
      data = []; // Empty ultimates
    } else if (sheetName === 'art_requests') {
      data = []; // Empty art requests
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      sheet: sheetName,
      data: data,
      message: `Sheet data retrieved successfully (serverless mode - empty data)`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[serverless] Error in sheets endpoint:`, error);
    
    // Return error response
    return res.status(500).json({
      success: false,
      message: 'Error fetching sheet data',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}; 