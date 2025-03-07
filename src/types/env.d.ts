/// <reference types="node" />

interface ImportMetaEnv {
  // Google Sheets related
  readonly VITE_GOOGLE_SHEETS_SPREADSHEET_ID: string;
  readonly VITE_GOOGLE_CLIENT_EMAIL: string;
  readonly VITE_GOOGLE_PRIVATE_KEY: string;
  
  // Google Drive related
  readonly VITE_GOOGLE_DRIVE_FOLDER_ID: string;
  
  // API Keys
  readonly VITE_HELIUS_API_KEY: string;
  readonly VITE_SOLANA_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    // Google Sheets related
    GOOGLE_SHEETS_SPREADSHEET_ID: string;
    GOOGLE_CLIENT_EMAIL: string;
    GOOGLE_PRIVATE_KEY: string;
    
    // Google Drive related
    GOOGLE_DRIVE_FOLDER_ID: string;
    
    // API Keys
    HELIUS_API_KEY: string;
    SOLANA_RPC_URL: string;
    
    // Environment
    NODE_ENV: 'development' | 'production' | 'test';
  }
} 