import './App.css';
import { useWallet } from './hooks/useWallet';

function App() {
  const { address, chainId, isConnected, connect, disconnect } = useWallet();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          NFT Game <span className="text-indigo-400">ZK-DEX</span>
        </h1>

        {isConnected ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Chain: {chainId}
            </span>
            <span className="bg-gray-800 px-3 py-1 rounded-lg text-sm font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              onClick={disconnect}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {isConnected ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* F1: Private NFT Transfer */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500 transition-colors">
              <h2 className="text-lg font-semibold mb-2">Private NFT Transfer</h2>
              <p className="text-sm text-gray-400 mb-4">
                Transfer NFT ownership privately with ZK proofs.
              </p>
              <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>

            {/* F5: Gaming Item Trade */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500 transition-colors">
              <h2 className="text-lg font-semibold mb-2">Gaming Item Trade</h2>
              <p className="text-sm text-gray-400 mb-4">
                Trade in-game items with hidden inventory and values.
              </p>
              <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>

            {/* F8: Card Draw */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500 transition-colors">
              <h2 className="text-lg font-semibold mb-2">Card Draw</h2>
              <p className="text-sm text-gray-400 mb-4">
                Provably fair card game with hidden hands.
              </p>
              <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-24">
            <h2 className="text-3xl font-bold mb-4">ZK-Powered NFT Gaming</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Private NFT transfers, verifiable item trading, and provably fair card games — all powered by zero-knowledge proofs.
            </p>
            <button
              onClick={connect}
              className="bg-indigo-600 hover:bg-indigo-700 px-8 py-3 rounded-xl text-lg transition-colors"
            >
              Connect Wallet to Start
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
