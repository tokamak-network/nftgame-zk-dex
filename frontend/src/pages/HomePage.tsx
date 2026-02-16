import { Link } from "react-router-dom";

const FEATURES = [
  {
    path: "/f1-private-nft",
    title: "F1: Private NFT Transfer",
    description:
      "Transfer NFT ownership privately using ZK proofs. The on-chain state reveals nothing about the owner.",
    color: "hover:border-blue-500",
  },
  {
    path: "/f4-loot-box",
    title: "F4: Loot Box Open",
    description:
      "Open loot boxes with verifiable randomness. A Poseidon VRF determines item rarity on-chain.",
    color: "hover:border-purple-500",
  },
  {
    path: "/f5-item-trade",
    title: "F5: Gaming Item Trade",
    description:
      "Trade in-game items with hidden inventory and values. Supports paid trades and free gifts.",
    color: "hover:border-green-500",
  },
  {
    path: "/f8-card-draw",
    title: "F8: Card Draw",
    description:
      "Provably fair card game with hidden hands. Fisher-Yates shuffle verified in a 99K-constraint circuit.",
    color: "hover:border-orange-500",
  },
];

export function HomePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">ZK-Powered NFT Gaming</h1>
        <p className="text-gray-400">
          Private NFT transfers, verifiable item trading, and provably fair card
          games -- all powered by zero-knowledge proofs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FEATURES.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className={`block bg-gray-900 border border-gray-800 rounded-xl p-6 transition-colors ${feature.color}`}
          >
            <h2 className="text-lg font-semibold mb-2">{feature.title}</h2>
            <p className="text-sm text-gray-400">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
