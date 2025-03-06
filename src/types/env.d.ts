/// <reference types="node" />

interface ImportMetaEnv {
  // Google Sheets related
  readonly VITE_GOOGLE_SHEETS_SPREADSHEET_ID: string;
  readonly VITE_GOOGLE_SHEETS_LISTINGS_SHEET_NAME: string;
  readonly VITE_GOOGLE_SHEETS_API_URL: string;
  readonly VITE_GOOGLE_SHEETS_CREDENTIALS: string;
  readonly VITE_GOOGLE_APPLICATION_CREDENTIALS: string;
  
  // Google Drive related
  readonly VITE_GOOGLE_DRIVE_FOLDER_ID: string;
  
  // API Keys
  readonly VITE_HELIUS_API_KEY: string;
  
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 