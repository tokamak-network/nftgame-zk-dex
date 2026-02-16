import { Outlet, Link, useLocation } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";

const NAV_ITEMS = [
  { path: "/", label: "Home" },
  { path: "/f1-private-nft", label: "F1: NFT Transfer" },
  { path: "/f4-loot-box", label: "F4: Loot Box" },
  { path: "/f5-item-trade", label: "F5: Item Trade" },
  { path: "/f8-card-draw", label: "F8: Card Draw" },
];

export function Layout() {
  const { address, chainId, isConnected, connect, disconnect } = useWallet();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-800">
          <Link to="/" className="text-lg font-bold tracking-tight">
            NFT Game <span className="text-indigo-400">ZK-DEX</span>
          </Link>
        </div>
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-2 text-sm transition-colors ${
                location.pathname === item.path
                  ? "bg-indigo-600/20 text-indigo-400 border-r-2 border-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-end">
          {isConnected ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">Chain: {chainId}</span>
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

        {/* Page content */}
        <main className="flex-1 px-6 py-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
