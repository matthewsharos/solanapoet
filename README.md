# Solana NFT Ultimate Tracker

This project tracks and identifies "Ultimate" rarity NFTs from a specific Solana collection. It uses the Helius API to fetch and analyze NFT metadata.

## Features

- Fetches all NFTs from a specified collection
- Identifies NFTs with "Ultimate" rarity
- Saves results to a JSON file with timestamp
- Handles pagination and rate limiting

## Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/solanapoet.git
cd solanapoet
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the script:
```bash
python track_ultimate_nfts.py
```

## Output

The script will create an `ultimate_nfts.json` file containing:
- Timestamp of last update
- Total number of NFTs checked
- List of Ultimate NFTs with their details:
  - NFT ID
  - Name
  - Rarity
  - Image URI
  - Attributes

## Note

Make sure to replace the Helius API key with your own if you plan to use this script.
