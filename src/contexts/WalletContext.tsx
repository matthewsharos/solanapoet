import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet, WalletContextState } from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { API_BASE_URL } from '../types/api';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletContextType {
  publicKey: string | null;
  connected: boolean;
  wallet: WalletContextState['wallet'];
  isAuthorizedMinter: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectWallet: () => void;
}

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connected: false,
  wallet: null,
  isAuthorizedMinter: false,
  connect: async () => {},
  disconnect: async () => {},
  selectWallet: () => {},
});

export const useWalletContext = () => useContext(WalletContext);

const WalletContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { publicKey, connected, wallet, disconnect: disconnectWallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [isAuthorizedMinter, setIsAuthorizedMinter] = useState(false);

  const checkMinterAuthorization = async (walletAddress: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mint/auth/${walletAddress}`);
      setIsAuthorizedMinter(response.data.isAuthorized || false);
    } catch (error) {
      console.error('Error checking minter authorization:', error);
      setIsAuthorizedMinter(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      checkMinterAuthorization(publicKey.toString());
    } else {
      setIsAuthorizedMinter(false);
    }
  }, [connected, publicKey]);

  const connect = async () => {
    try {
      if (wallet) {
        await wallet.adapter.connect();
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  const disconnect = async () => {
    try {
      if (disconnectWallet) {
        await disconnectWallet();
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  const selectWallet = () => {
    setVisible(true);
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey: publicKey ? publicKey.toString() : null,
        connected,
        wallet,
        isAuthorizedMinter,
        connect,
        disconnect,
        selectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => clusterApiUrl(WalletAdapterNetwork.Mainnet), []);
  
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter()
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletContextProvider>
            {children}
          </WalletContextProvider>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}; 