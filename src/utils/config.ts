// Configuration interface
interface ServerConfig {
  hasGoogleCredentials: boolean;
  hasSpreadsheetId: boolean;
  hasHeliusApiKey: boolean;
  hasSolanaRpcUrl: boolean;
  isConfigured: boolean;
  HELIUS_API_KEY: string | null;
  SOLANA_RPC_URL: string | null;
  environment: string;
}

let cachedConfig: ServerConfig | null = null;

export const getServerConfig = async (): Promise<ServerConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('Failed to fetch server configuration');
    }
    
    const config = await response.json();
    cachedConfig = config;
    return config;
  } catch (error) {
    console.error('Error fetching server configuration:', error);
    throw error;
  }
};

export const resetConfigCache = () => {
  cachedConfig = null;
};

export const getHeliusApiKey = async (): Promise<string> => {
  const config = await getServerConfig();
  if (!config.HELIUS_API_KEY) {
    throw new Error('Helius API key not configured');
  }
  return config.HELIUS_API_KEY;
};

export const getSolanaRpcUrl = async (): Promise<string> => {
  const config = await getServerConfig();
  if (!config.SOLANA_RPC_URL) {
    throw new Error('Solana RPC URL not configured');
  }
  return config.SOLANA_RPC_URL;
}; 