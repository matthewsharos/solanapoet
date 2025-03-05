# Solana Poet NFT Marketplace

A modern NFT marketplace built on Solana, featuring a vintage-inspired UI design.

## Features

- **NFT Browsing**: View all unburned NFTs from valid collections
- **Collection Management**: Add and manage NFT collections
- **Search & Filter**: Find NFTs by name, description, or collection
- **Responsive Design**: Beautiful vintage-inspired UI that works on all devices

## Market Page

The Market page displays all unburned NFTs from collections that have been added to the platform. Features include:

- Collection filtering
- Search functionality
- Pagination for browsing large collections
- NFT cards showing image, name, description, and attributes
- Detailed view for each NFT

## Technical Implementation

- Built with React and TypeScript
- Uses Material UI for components with custom styling
- Integrates with Helius API for Solana NFT data
- Local storage for collection management
- Responsive design for all device sizes

## Getting Started

### Prerequisites

- Node.js v18+ (v20+ recommended)
- npm or yarn
- MongoDB (local or remote)
- Solana wallet (like Phantom)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/solanapoet.git
   cd solanapoet
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/degenpoet
   HELIUS_API_KEY=your_helius_api_key
   SOLANA_NETWORK=mainnet
   AUTHORIZED_MINTER=your_wallet_address
   ```

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```
npm run build
```

## Project Structure

```
solanapoet/
├── src/
│   ├── assets/           # Static assets
│   ├── components/       # Reusable UI components
│   ├── contexts/         # React contexts (wallet, etc.)
│   ├── pages/            # Page components
│   ├── server/           # Backend server code
│   │   ├── models/       # MongoDB models
│   │   └── routes/       # API routes
│   ├── styles/           # Global styles
│   └── utils/            # Utility functions
├── public/               # Public static files
├── .env                  # Environment variables
└── README.md             # Project documentation
```

## Authentication

The mint page is restricted to authorized users only. The authorized wallet address is specified in the `.env` file.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Solana Foundation
- Metaplex Foundation
- Helius
- Material-UI Team

## Google Sheets Integration

This application uses Google Sheets as a backend for NFT listings instead of the Metaplex auction house. This provides a simple, no-code way to manage listings without requiring complex infrastructure.

### Setting Up Your Google Sheet for NFT Listings

1. Create a new Google Sheet with the following columns in the first row:
   - `mint_id` - The NFT's mint address
   - `list_date` - When the NFT was listed (ISO date string)
   - `list_price_sol` - The listing price in SOL
   - `collection_id` - The collection ID the NFT belongs to

2. Connect your Google Sheet with [sheet.best](https://sheet.best):
   - Sign up for an account on sheet.best
   - Create a new connection and point it to your Google Sheet
   - Get your unique API endpoint URL

3. Update the code in `src/api/googleSheets.ts` by replacing the `GOOGLE_SHEETS_API_URL` with your sheet.best API URL:
   ```typescript
   export const GOOGLE_SHEETS_API_URL = 'YOUR_SHEET_BEST_API_URL';
   ```

   Note: If you don't configure a valid URL, the application will automatically fall back to using localStorage.

### Collection Management with Google Sheets

Collections can be stored in a separate tab of your Google Sheet for better organization. Follow these steps to set up collection management:

1. **Create a "collections" tab in your Google Sheet**
   - Open your Google Sheet used for NFT listings
   - Add a new tab named "collections" (case sensitive)
   - Add the following column headers in the first row:
     - `address` - The collection address
     - `name` - The collection name
     - `image` - URL to the collection image
     - `description` - A description of the collection
     - `addedAt` - Timestamp when the collection was added

2. **Create a Sheet.best Connection for the Collections Tab**
   - Go to [sheet.best](https://sheet.best) and connect to your Google Sheet
   - **IMPORTANT:** When creating the connection, make sure to select the "collections" tab
   - This will create a separate API URL specifically for the collections tab

3. **Update Your Collections API URL**
   - Edit `src/api/collections.ts` and set the `COLLECTIONS_API_URL` to your new Sheet.best API URL
   - The URL should have the format: `https://api.sheetbest.com/sheets/YOUR-UUID/tabs/collections`
   - Set `useLocalStorageForCollections` to `false` to use Google Sheets instead of localStorage

4. **Troubleshooting**
   - If collections aren't being saved, check your browser console for error messages
   - Verify that your Google Sheet has the correct "collections" tab name (case sensitive)
   - Make sure your Sheet.best connection is specifically for the collections tab
   - The API URL should end with `/tabs/collections`

5. **Testing Your Setup**
   - You can run the included test script with `node src/tests/testCollectionSheet.js`
   - Or open `src/tests/testCollectionsUI.html` in your browser to test the collections API directly

Note: If you prefer to use localStorage for collections instead of Google Sheets, set `useLocalStorageForCollections` to `true` in `src/api/collections.ts`.

## How It Works

When a user lists an NFT, the application creates a new row in the Google Sheet with:
- The NFT's mint address
- The current timestamp
- The listing price in SOL
- The collection ID

When an NFT is unlisted or purchased, the corresponding row is removed from the sheet.

The application checks the Google Sheet to determine if an NFT is currently listed and at what price.
