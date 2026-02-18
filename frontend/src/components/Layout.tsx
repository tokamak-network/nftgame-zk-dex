import { Outlet, Link, useLocation } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: "◆" },
  { path: "/f1-private-nft", label: "F1: NFT Transfer", icon: "◈", color: "neon-text-cyan" },
  { path: "/f4-loot-box", label: "F4: Loot Box", icon: "◈", color: "neon-text-magenta" },
  { path: "/f5-item-trade", label: "F5: Item Trade", icon: "◈", color: "neon-text-orange" },
  { path: "/f8-card-draw", label: "F8: Card Draw", icon: "◈", color: "neon-text-green" },
];

export function Layout() {
  const { address, chainId, isConnected, connect, disconnect } = useWallet();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg-deep text-white flex grid-bg">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border-dim flex flex-col shrink-0 glass-panel rounded-none border-l-0 border-t-0 border-b-0">
        <div className="px-5 py-5 border-b border-border-dim">
          <Link to="/" className="block glitch-text">
            <span className="font-display text-lg font-bold tracking-wider neon-text-cyan">
              NEON
            </span>
            <span className="font-display text-lg font-bold tracking-wider text-white ml-1">
              ARENA
            </span>
            <span className="block text-xs font-body text-gray-500 tracking-widest mt-0.5">
              ZK-POWERED NFT GAMING
            </span>
          </Link>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm font-body font-semibold transition-all ${
                  isActive
                    ? `${item.color || "neon-text-cyan"} bg-white/5 border-r-2 border-neon-cyan`
                    : "text-gray-500 hover:text-gray-200 hover:bg-white/[0.03]"
                }`}
              >
                <span className={`text-xs ${isActive ? item.color || "neon-text-cyan" : ""}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-border-dim">
          <div className="text-[10px] font-mono text-gray-600 tracking-wider">
            CIRCUIT // VERIFY // TRADE
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-border-dim px-6 py-3 flex items-center justify-end scanline-overlay">
          {isConnected ? (
            <div className="flex items-center gap-4">
              <span className="text-xs font-body text-gray-500">
                Chain <span className="neon-text-cyan">{chainId}</span>
              </span>
              <span className="glass-panel px-3 py-1.5 text-xs font-mono neon-text-cyan">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={disconnect}
                className="neon-btn neon-btn-magenta text-xs py-1.5 px-3"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="neon-btn neon-btn-cyan"
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
