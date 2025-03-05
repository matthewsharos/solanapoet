/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PINATA_JWT: string;
  readonly VITE_AUTHORIZED_MINTER: string;
  readonly VITE_IPFS_GATEWAY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Add global Buffer definition
interface Window {
  Buffer: typeof Buffer;
}
