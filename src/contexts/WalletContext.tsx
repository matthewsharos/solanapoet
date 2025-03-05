import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import axios from 'axios';
import { getApiBaseUrl } from '../api/marketplace';

interface WalletContextType {
  publicKey: PublicKey | null;
  connecting: boolean;
  connected: boolean;
  isAuthorizedMinter: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  wallet: PhantomWalletAdapter | null;
}

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connecting: false,
  connected: false,
  isAuthorizedMinter: false,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  wallet: null,
});

export const useWalletContext = () => useContext(WalletContext);

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [adapter, setAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAuthorizedMinter, setIsAuthorizedMinter] = useState(false);

  // Initialize wallet adapter
  useEffect(() => {
    const initWallet = async () => {
      try {
        console.log('Initializing wallet adapter...');
        const phantomAdapter = new PhantomWalletAdapter();
        
        console.log('PhantomWalletAdapter initialized with methods:', Object.keys(phantomAdapter));
        console.log('PhantomWalletAdapter prototype methods:', 
          Object.getOwnPropertyNames(Object.getPrototypeOf(phantomAdapter)));
        
        if (!phantomAdapter.signTransaction) {
          console.warn('Warning: PhantomWalletAdapter does not have signTransaction method');
        }
        
        if (!phantomAdapter.signAllTransactions) {
          console.warn('Warning: PhantomWalletAdapter does not have signAllTransactions method');
        }
        
        setAdapter(phantomAdapter);

        phantomAdapter.on('connect', () => {
          if (phantomAdapter.publicKey) {
            console.log('Wallet connected with public key:', phantomAdapter.publicKey.toString());
            console.log('Available wallet methods after connection:', Object.keys(phantomAdapter));
            
            const hasSignTransaction = typeof phantomAdapter.signTransaction === 'function';
            const hasSignAllTransactions = typeof phantomAdapter.signAllTransactions === 'function';
            
            console.log('Has signTransaction:', hasSignTransaction);
            console.log('Has signAllTransactions:', hasSignAllTransactions);
            
            if (!hasSignTransaction && !hasSignAllTransactions) {
              console.error('Your wallet does not support transaction signing. This will prevent you from purchasing NFTs.');
              alert('Warning: Your wallet does not have the required signing methods. You will not be able to purchase NFTs. Please try reconnecting or using a different wallet.');
            }
            
            setPublicKey(phantomAdapter.publicKey);
            setConnected(true);
            localStorage.setItem('walletConnected', 'true');
          }
        });

        phantomAdapter.on('disconnect', () => {
          console.log('Wallet disconnected');
          setPublicKey(null);
          setConnected(false);
          localStorage.removeItem('walletConnected');
        });

        if (localStorage.getItem('walletConnected') === 'true') {
          setTimeout(() => {
            connectWallet();
          }, 500);
        }
      } catch (error) {
        console.error('Failed to initialize wallet adapter:', error);
      }
    };

    initWallet();

    return () => {
      if (adapter) {
        adapter.disconnect();
      }
    };
  }, []);

  // Check if wallet is authorized to mint
  useEffect(() => {
    const checkAuthorization = async () => {
      if (publicKey) {
        try {
          const apiBaseUrl = await getApiBaseUrl();
          const response = await axios.get(`${apiBaseUrl}/api/auth/check-minter/${publicKey.toString()}`);
          setIsAuthorizedMinter(response.data.isAuthorized);
        } catch (error) {
          console.error('Failed to check minter authorization:', error);
          setIsAuthorizedMinter(false);
        }
      } else {
        setIsAuthorizedMinter(false);
      }
    };

    checkAuthorization();
  }, [publicKey]);

  const connectWallet = async () => {
    if (!adapter) {
      console.error('Wallet adapter not initialized');
      return;
    }

    if (connecting) {
      console.log('Already attempting to connect wallet');
      return;
    }

    try {
      setConnecting(true);
      
      // Check if already connected
      if (adapter.connected) {
        console.log('Wallet already connected');
        if (adapter.publicKey) {
          setPublicKey(adapter.publicKey);
          setConnected(true);
          localStorage.setItem('walletConnected', 'true');
        }
        return;
      }
      
      // Connect to wallet
      await adapter.connect();
      
      if (adapter.publicKey) {
        console.log('Wallet connected successfully', {
          publicKey: adapter.publicKey.toString(),
          hasSignTransaction: !!adapter.signTransaction,
          hasSignAllTransactions: !!adapter.signAllTransactions,
          methods: Object.keys(adapter)
        });
        
        // Check if wallet supports transaction signing
        if (!adapter.signTransaction && !adapter.signAllTransactions) {
          console.error('Connected wallet does not support transaction signing');
          alert('Your wallet does not support transaction signing. Please use a different wallet or update your wallet extension.');
        }
        
        setPublicKey(adapter.publicKey);
        setConnected(true);
        localStorage.setItem('walletConnected', 'true');
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      // Clean up on error
      setPublicKey(null);
      setConnected(false);
      localStorage.removeItem('walletConnected');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    if (adapter) {
      try {
        adapter.disconnect();
      } catch (error) {
        console.error('Failed to disconnect wallet:', error);
      }
    }
    
    setPublicKey(null);
    setConnected(false);
    setIsAuthorizedMinter(false);
    localStorage.removeItem('walletConnected');
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connecting,
        connected,
        isAuthorizedMinter,
        connectWallet,
        disconnectWallet,
        wallet: adapter,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}; 