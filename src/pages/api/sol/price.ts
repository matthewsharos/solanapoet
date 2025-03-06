import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch SOL price from a reliable source
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    const solPrice = data.solana.usd;

    return res.status(200).json({ price: solPrice });
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    return res.status(500).json({ error: 'Failed to fetch SOL price' });
  }
} 