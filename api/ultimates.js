import axios from 'axios';

// Serverless function for fetching ultimate NFTs data
export default async function handler(req, res) {
  console.log('[serverless] Ultimates endpoint called');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get ultimate NFTs from Google Sheets
    console.log('Fetching ultimates from Google Sheets...');
    
    // Use internal sheets API to get the ultimates data
    const response = await axios.get('/api/sheets/ultimates', {
      baseURL: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to fetch ultimates data from Google Sheets');
    }
    
    // Process the raw data to ensure it's valid
    const rawData = response.data.data || [];
    
    // Skip header row
    const rows = rawData.slice(1);
    
    // Process and validate each row
    const ultimateNFTs = rows.map(row => {
      // Ensure we have the required fields for a valid ultimate NFT
      const nftAddress = row[0] || '';
      const name = row[1] || '';
      const owner = row[2] || '';
      const collectionId = row[3] || '';
      
      return {
        "NFT Address": nftAddress,
        "Name": name || 'Unnamed Ultimate',
        "Owner": owner,
        "collection_id": collectionId
      };
    }).filter(nft => nft["NFT Address"] && nft.collection_id);
    
    // Return the data with some debugging info
    return res.status(200).json({
      success: true,
      length: ultimateNFTs.length,
      sample: ultimateNFTs.length > 0 ? ultimateNFTs[0] : null,
      data: ultimateNFTs
    });
  } catch (error) {
    console.error('Ultimates endpoint error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching ultimates',
      error: error.message
    });
  }
} 