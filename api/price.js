// Serverless function for fetching SOL price
export default async function handler(req, res) {
  console.log('[serverless] SOL price endpoint called');
  
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
    // Fetch SOL price from a reliable source (CoinGecko)
    console.log('Fetching SOL price from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const solPrice = data.solana.usd;
    
    console.log(`Current SOL price: $${solPrice}`);
    
    return res.status(200).json({
      success: true,
      price: solPrice,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    
    // Attempt a fallback if CoinGecko fails
    try {
      console.log('Attempting fallback to Binance API...');
      const fallbackResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
      
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        const fallbackPrice = parseFloat(fallbackData.price);
        
        console.log(`Fallback SOL price: $${fallbackPrice}`);
        
        return res.status(200).json({
          success: true,
          price: fallbackPrice,
          source: 'binance',
          timestamp: Date.now()
        });
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch SOL price',
      message: error.message
    });
  }
} 