import { buildBabyjub, buildPoseidon } from "circomlibjs";
import type { Keypair } from "./types";

// Singleton instances
let babyJub: Awaited<ReturnType<typeof buildBabyjub>> | null = null;
let poseidon: Awaited<ReturnType<typeof buildPoseidon>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let F: any = null;

/**
 * Initialize circomlibjs WASM modules (call once at app startup)
 */
export async function init() {
  if (!babyJub) {
    babyJub = await buildBabyjub();
    poseidon = await buildPoseidon();
    F = babyJub.F;
  }
}

/**
 * Compute Poseidon hash over an array of bigints
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  await init();
  const hash = poseidon!(inputs);
  return poseidon!.F.toObject(hash);
}

/**
 * Generate a random secret key (browser-safe)
 */
export async function randomSecretKey(): Promise<bigint> {
  await init();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex) % babyJub!.subOrder;
}

/**
 * Derive BabyJubJub public key from secret key
 */
export async function getPublicKey(
  sk: bigint,
): Promise<{ x: bigint; y: bigint }> {
  await init();
  const pubKey = babyJub!.mulPointEscalar(babyJub!.Base8, sk);
  return {
    x: F.toObject(pubKey[0]),
    y: F.toObject(pubKey[1]),
  };
}

/**
 * Generate a full keypair
 */
export async function generateKeypair(): Promise<Keypair> {
  const sk = await randomSecretKey();
  const pk = await getPublicKey(sk);
  return { sk, pk };
}

/**
 * Generate a random 31-byte salt (matches test pattern)
 */
export function randomSalt(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex);
}

/**
 * Convert bigint to 0x-prefixed 64-char hex string (bytes32)
 */
export function toBytes32(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}
