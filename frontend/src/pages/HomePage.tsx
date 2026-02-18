import { Link } from "react-router-dom";

const FEATURES = [
  {
    path: "/f1-private-nft",
    title: "F1: Private NFT Transfer",
    tag: "STEALTH",
    description:
      "Transfer NFT ownership privately using ZK proofs. The on-chain state reveals nothing about the owner.",
    accent: "cyan" as const,
    neonClass: "neon-text-cyan",
    hoverClass: "hover-glow-cyan",
    bgGlow: "rgba(0, 240, 255, 0.05)",
  },
  {
    path: "/f4-loot-box",
    title: "F4: Loot Box Open",
    tag: "VRF",
    description:
      "Open loot boxes with verifiable randomness. A Poseidon VRF determines item rarity on-chain.",
    accent: "magenta" as const,
    neonClass: "neon-text-magenta",
    hoverClass: "hover-glow-magenta",
    bgGlow: "rgba(255, 0, 170, 0.05)",
  },
  {
    path: "/f5-item-trade",
    title: "F5: Gaming Item Trade",
    tag: "TRADE",
    description:
      "Trade in-game items with hidden inventory and values. Supports paid trades and free gifts.",
    accent: "orange" as const,
    neonClass: "neon-text-orange",
    hoverClass: "hover-glow-orange",
    bgGlow: "rgba(255, 102, 0, 0.05)",
  },
  {
    path: "/f8-card-draw",
    title: "F8: Card Draw",
    tag: "SHUFFLE",
    description:
      "Provably fair card game with hidden hands. Fisher-Yates shuffle verified in a 99K-constraint circuit.",
    accent: "green" as const,
    neonClass: "neon-text-green",
    hoverClass: "hover-glow-green",
    bgGlow: "rgba(57, 255, 20, 0.05)",
  },
];

export function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl font-black tracking-wider mb-3 glitch-text">
          <span className="neon-text-cyan">ZK</span>
          <span className="text-white">-Powered </span>
          <span className="neon-text-magenta">NFT</span>
          <span className="text-white"> Gaming</span>
        </h1>
        <p className="font-body text-gray-500 max-w-lg mx-auto text-lg">
          Private NFT transfers, verifiable item trading, and provably fair card
          games — all powered by zero-knowledge proofs.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger-in">
        {FEATURES.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className={`group block glass-panel border p-6 transition-all ${feature.hoverClass} relative overflow-hidden`}
            style={{
              ["--pulse-color" as string]: feature.bgGlow,
            }}
          >
            {/* Holographic shimmer on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity holographic pointer-events-none" />

            {/* Tag */}
            <div className="flex items-center justify-between mb-3 relative">
              <span className={`font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border rounded ${feature.neonClass}`}
                style={{ borderColor: "currentColor" }}
              >
                {feature.tag}
              </span>
            </div>

            {/* Title */}
            <h2 className={`font-display font-bold text-base tracking-wide mb-2 relative ${feature.neonClass}`}>
              {feature.title}
            </h2>

            {/* Description */}
            <p className="text-sm font-body text-gray-500 relative leading-relaxed">
              {feature.description}
            </p>

            {/* Bottom accent line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: `linear-gradient(90deg, transparent, var(--color-neon-${feature.accent}), transparent)`,
              }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
