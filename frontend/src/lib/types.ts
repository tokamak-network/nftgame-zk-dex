// Circuit names matching file paths in public/circuits/
export const CIRCUIT_NAMES = {
  PRIVATE_NFT_TRANSFER: "private_nft_transfer",
  LOOT_BOX_OPEN: "loot_box_open",
  GAMING_ITEM_TRADE: "gaming_item_trade",
  CARD_DRAW: "card_draw",
} as const;

export type CircuitName = (typeof CIRCUIT_NAMES)[keyof typeof CIRCUIT_NAMES];

// Formatted proof for Solidity verifier
export type SolidityProof = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
};

export type ProofResult = {
  proof: SolidityProof;
  publicSignals: string[];
  duration: number;
};

// Note states matching the contract enum
export const NOTE_STATES = {
  INVALID: 0,
  VALID: 1,
  SPENT: 2,
} as const;

export type NoteState = (typeof NOTE_STATES)[keyof typeof NOTE_STATES];

// Contract names matching ABI file names
export const CONTRACT_NAMES = {
  PRIVATE_NFT: "PrivateNFT",
  LOOT_BOX_OPEN: "LootBoxOpen",
  GAMING_ITEM_TRADE: "GamingItemTrade",
  CARD_DRAW: "CardDraw",
} as const;

export type ContractName = (typeof CONTRACT_NAMES)[keyof typeof CONTRACT_NAMES];

// Keypair
export type Keypair = {
  sk: bigint;
  pk: { x: bigint; y: bigint };
};

// Rarity levels for loot box
export const RARITY_LABELS = ["Legendary", "Epic", "Rare", "Common"] as const;
export type RarityLabel = (typeof RARITY_LABELS)[number];

export const RARITY_COLORS: Record<RarityLabel, string> = {
  Legendary: "neon-text-yellow",
  Epic: "neon-text-purple",
  Rare: "neon-text-cyan",
  Common: "text-gray-400",
};

// Card suits and ranks for F8
export const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
