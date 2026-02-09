import { useState, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

interface WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    provider: null,
    signer: null,
    address: null,
    chainId: null,
    isConnected: false,
  });

  const connect = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('MetaMask not detected. Please install MetaMask.');
      return;
    }

    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      setWallet({
        provider,
        signer,
        address,
        chainId: Number(network.chainId),
        isConnected: true,
      });
    } catch (err) {
      console.error('Failed to connect wallet:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      provider: null,
      signer: null,
      address: null,
      chainId: null,
      isConnected: false,
    });
  }, []);

  return { ...wallet, connect, disconnect };
}
