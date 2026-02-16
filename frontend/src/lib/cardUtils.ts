import { poseidonHash, randomSalt, generateKeypair } from "./crypto";
import type { Keypair } from "./types";
import { generateProof } from "./proofGenerator";
import { CIRCUIT_NAMES, SUITS, RANKS } from "./types";

/**
 * Fisher-Yates shuffle using Poseidon VRF (mirrors circuit logic)
 */
export async function fisherYatesShuffle(
  seed: bigint,
  n = 52,
): Promise<number[]> {
  const deck = Array.from({ length: n }, (_, i) => i);

  for (let s = 0; s < n - 1; s++) {
    const i = n - 1 - s;
    const randHash = await poseidonHash([seed, BigInt(s)]);
    const randomVal = Number(randHash & 0x3FFFn); // 14-bit extraction
    const j = randomVal % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * Compute deck commitment: recursive Poseidon chain
 * h = Poseidon(cards[0], cards[1])
 * h = Poseidon(h, cards[i]) for i=2..51
 * final = Poseidon(h, deckSalt)
 */
export async function computeDeckCommitment(
  deckCards: number[],
  deckSalt: bigint,
): Promise<bigint> {
  let h = await poseidonHash([BigInt(deckCards[0]), BigInt(deckCards[1])]);
  for (let i = 2; i < deckCards.length; i++) {
    h = await poseidonHash([h, BigInt(deckCards[i])]);
  }
  return poseidonHash([h, deckSalt]);
}

export type F8SetupResult = {
  player: Keypair;
  deckCards: number[];
  deckCommitment: bigint;
  deckSalt: bigint;
  shuffleSeed: bigint;
  gameId: bigint;
  playerCommitment: bigint;
};

/**
 * Setup a new card game: generate keypair, shuffle deck, compute commitment
 */
export async function setupF8Game(gameId: bigint): Promise<F8SetupResult> {
  const player = await generateKeypair();
  const shuffleSeed = randomSalt();
  const deckSalt = randomSalt();

  const deckCards = await fisherYatesShuffle(shuffleSeed);
  const deckCommitment = await computeDeckCommitment(deckCards, deckSalt);
  const playerCommitment = await poseidonHash([
    player.pk.x, player.pk.y, gameId,
  ]);

  return {
    player, deckCards, deckCommitment, deckSalt, shuffleSeed, gameId,
    playerCommitment,
  };
}

export type F8DrawInputs = {
  drawCommitment: bigint;
  drawnCard: number;
  circuitInputs: Record<string, unknown>;
};

/**
 * Prepare circuit inputs for drawing a card at a given index
 */
export async function prepareF8Draw(
  game: F8SetupResult,
  drawIndex: number,
): Promise<F8DrawInputs> {
  const handSalt = randomSalt();
  const drawnCard = game.deckCards[drawIndex];

  const drawCommitment = await poseidonHash([
    BigInt(drawnCard),
    BigInt(drawIndex),
    game.gameId,
    handSalt,
  ]);

  const circuitInputs = {
    deckCommitment: game.deckCommitment.toString(),
    drawCommitment: drawCommitment.toString(),
    drawIndex: drawIndex.toString(),
    gameId: game.gameId.toString(),
    playerCommitment: game.playerCommitment.toString(),
    playerPkX: game.player.pk.x.toString(),
    playerPkY: game.player.pk.y.toString(),
    playerSk: game.player.sk.toString(),
    shuffleSeed: game.shuffleSeed.toString(),
    deckCards: game.deckCards.map(String),
    drawnCard: drawnCard.toString(),
    handSalt: handSalt.toString(),
    deckSalt: game.deckSalt.toString(),
  };

  return { drawCommitment, drawnCard, circuitInputs };
}

export async function generateF8Proof(circuitInputs: Record<string, unknown>) {
  return generateProof(CIRCUIT_NAMES.CARD_DRAW, circuitInputs);
}

/**
 * Get card display name from card index (0-51)
 */
export function getCardName(cardIndex: number): string {
  const suit = SUITS[Math.floor(cardIndex / 13)];
  const rank = RANKS[cardIndex % 13];
  return `${rank}${suit}`;
}

/**
 * Get card color (red for hearts/diamonds, white for spades/clubs)
 */
export function getCardColor(cardIndex: number): string {
  const suitIndex = Math.floor(cardIndex / 13);
  return suitIndex === 1 || suitIndex === 2 ? "text-red-400" : "text-white";
}
