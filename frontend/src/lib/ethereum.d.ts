interface Window {
  ethereum?: import('ethers').Eip1193Provider & {
    isMetaMask?: boolean;
    on?: (event: string, callback: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
  };
}
