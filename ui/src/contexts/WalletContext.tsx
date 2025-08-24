'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ethers } from 'ethers';

interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  isInitialized: boolean;
}

interface WalletContextType extends WalletState {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

// SEI Testnet chain ID
const SUPPORTED_CHAIN_ID = 1328; // SEI Testnet
const SEI_TESTNET_CONFIG = {
  chainId: '0x530', // 1328 in hex
  chainName: 'SEI Testnet',
  rpcUrls: ['https://evm-rpc-testnet.sei-apis.com'],
  nativeCurrency: {
    name: 'SEI',
    symbol: 'SEI',
    decimals: 18,
  },
  blockExplorerUrls: ['https://seitrace.com'],
};

export function WalletProvider({ children }: WalletProviderProps) {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    isInitialized: false,
  });

  // Check for existing connection on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (typeof window === 'undefined' || !window.ethereum) return;

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        
        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();
          const chainId = Number(network.chainId);
          
          setWalletState({
            address,
            provider,
            signer,
            isConnected: true,
            isConnecting: false,
            chainId,
            isInitialized: true,
          });
        } else {
          // No existing connection, but we're done checking
          setWalletState(prev => ({ ...prev, isInitialized: true }));
        }
      } catch (error) {
        console.log('No existing wallet connection found');
        setWalletState(prev => ({ ...prev, isInitialized: true }));
      }
    };

    checkExistingConnection();
  }, []);

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask is required to use this application. Please install MetaMask extension.');
      return;
    }

    try {
      setWalletState(prev => ({ ...prev, isConnecting: true }));

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      
      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Check if on correct network first
      if (chainId !== SUPPORTED_CHAIN_ID) {
        alert(`Please switch to SEI Testnet. This application only supports SEI Testnet (Chain ID: ${SUPPORTED_CHAIN_ID}).`);
        await switchNetwork(SUPPORTED_CHAIN_ID);
        return; // Let the network change handler complete the connection
      }

      setWalletState({
        address,
        provider,
        signer,
        isConnected: true,
        isConnecting: false,
        chainId,
        isInitialized: true,
      });

    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setWalletState(prev => ({ ...prev, isConnecting: false }));
      
      if (error instanceof Error && error.message.includes('User rejected')) {
        alert('Connection cancelled by user.');
      } else {
        alert('Failed to connect wallet. Please make sure you are on SEI Testnet and try again.');
      }
    }
  };

  const disconnectWallet = () => {
    setWalletState({
      address: null,
      provider: null,
      signer: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
      isInitialized: true,
    });
  };

  const switchNetwork = async (targetChainId: number) => {
    if (!window.ethereum) return;

    // Only allow switching to SEI testnet
    if (targetChainId !== SUPPORTED_CHAIN_ID) {
      alert('This application only supports SEI Testnet.');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEI_TESTNET_CONFIG.chainId }],
      });
    } catch (error: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [SEI_TESTNET_CONFIG],
          });
          
          // After adding, try to connect again
          setTimeout(() => {
            connectWallet();
          }, 1000);
          
        } catch (addError) {
          console.error('Failed to add SEI testnet:', addError);
          alert('Failed to add SEI Testnet to MetaMask. Please add it manually.');
        }
      } else {
        console.error('Failed to switch to SEI testnet:', error);
        alert('Failed to switch to SEI Testnet. Please switch manually in MetaMask.');
      }
    }
  };

  // Handle account and network changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== walletState.address) {
        connectWallet();
      }
    };

    const handleChainChanged = (chainId: string) => {
      const newChainId = parseInt(chainId, 16);
      setWalletState(prev => ({ ...prev, chainId: newChainId }));
      
      // If user switches to unsupported network, disconnect
      if (newChainId !== SUPPORTED_CHAIN_ID && walletState.isConnected) {
        alert('Unsupported network detected. This application only works on SEI Testnet. Please switch back or disconnect.');
        disconnectWallet();
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [walletState.address]);

  const contextValue: WalletContextType = {
    ...walletState,
    connectWallet,
    disconnectWallet,
    switchNetwork,
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ethereum?: any;
  }
}