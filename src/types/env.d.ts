/// <reference types="node" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SHEETS_SPREADSHEET_ID: string;
  readonly VITE_GOOGLE_SHEETS_LISTINGS_SHEET_NAME: string;
  readonly VITE_GOOGLE_SHEETS_API_URL: string;
  readonly VITE_GOOGLE_SHEETS_CREDENTIALS: string;
  readonly VITE_GOOGLE_APPLICATION_CREDENTIALS: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 