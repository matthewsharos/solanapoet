import React, { createContext, useContext, useState, useEffect } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import axios from 'axios';
import { API_BASE_URL } from '../types/api';

interface WalletContextType {
  publicKey: string | null;
  connected: boolean;
  wallet: PhantomWalletAdapter | null;
  isAuthorizedMinter: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connected: false,
  wallet: null,
  isAuthorizedMinter: false,
  connect: async () => {},
  disconnect: async () => {},
});

export const useWalletContext = () => useContext(WalletContext);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [wallet, setWallet] = useState<PhantomWalletAdapter | null>(null);
  const [isAuthorizedMinter, setIsAuthorizedMinter] = useState(false);

  useEffect(() => {
    const initializeWallet = async () => {
      try {
        const phantomWallet = new PhantomWalletAdapter();
        setWallet(phantomWallet);

        phantomWallet.on('connect', () => {
          if (phantomWallet.publicKey) {
            setPublicKey(phantomWallet.publicKey.toString());
            setConnected(true);
            checkMinterAuthorization(phantomWallet.publicKey.toString());
          }
        });

        phantomWallet.on('disconnect', () => {
          setPublicKey(null);
          setConnected(false);
          setIsAuthorizedMinter(false);
        });

        // Try to eagerly connect
        try {
          await phantomWallet.connect();
        } catch (err) {
          // Handle connection error silently
          console.log('No pre-existing Phantom connection');
        }
      } catch (error) {
        console.error('Error initializing wallet:', error);
      }
    };

    initializeWallet();

    return () => {
      if (wallet) {
        wallet.disconnect();
      }
    };
  }, []);

  const checkMinterAuthorization = async (walletAddress: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mint/auth/${walletAddress}`);
      setIsAuthorizedMinter(response.data.isAuthorized || false);
    } catch (error) {
      console.error('Error checking minter authorization:', error);
      setIsAuthorizedMinter(false);
    }
  };

  const connect = async () => {
    if (wallet) {
      try {
        await wallet.connect();
      } catch (error) {
        console.error('Error connecting wallet:', error);
      }
    }
  };

  const disconnect = async () => {
    if (wallet) {
      try {
        await wallet.disconnect();
      } catch (error) {
        console.error('Error disconnecting wallet:', error);
      }
    }
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected,
        wallet,
        isAuthorizedMinter,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}; 