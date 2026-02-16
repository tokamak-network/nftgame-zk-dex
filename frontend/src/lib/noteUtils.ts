import { poseidonHash, randomSalt, generateKeypair } from "./crypto";
import type { Keypair, SolidityProof } from "./types";
import { generateProof } from "./proofGenerator";
import { CIRCUIT_NAMES } from "./types";

// ─── F1: Private NFT Transfer ───

export type F1SetupResult = {
  oldOwner: Keypair;
  newOwner: Keypair;
  oldNftHash: bigint;
  newNftHash: bigint;
  nullifier: bigint;
  nftId: bigint;
  collectionAddress: bigint;
  oldSalt: bigint;
  newSalt: bigint;
  circuitInputs: Record<string, unknown>;
};

export async function setupF1Transfer(
  nftId: bigint,
  collectionAddress: bigint,
): Promise<F1SetupResult> {
  const oldOwner = await generateKeypair();
  const newOwner = await generateKeypair();
  const oldSalt = randomSalt();
  const newSalt = randomSalt();

  const oldNftHash = await poseidonHash([
    oldOwner.pk.x, oldOwner.pk.y, nftId, collectionAddress, oldSalt,
  ]);
  const newNftHash = await poseidonHash([
    newOwner.pk.x, newOwner.pk.y, nftId, collectionAddress, newSalt,
  ]);
  const nullifier = await poseidonHash([nftId, oldSalt, oldOwner.sk]);

  const circuitInputs = {
    oldNftHash: oldNftHash.toString(),
    newNftHash: newNftHash.toString(),
    nftId: nftId.toString(),
    collectionAddress: collectionAddress.toString(),
    nullifier: nullifier.toString(),
    oldOwnerPkX: oldOwner.pk.x.toString(),
    oldOwnerPkY: oldOwner.pk.y.toString(),
    oldOwnerSk: oldOwner.sk.toString(),
    oldSalt: oldSalt.toString(),
    newOwnerPkX: newOwner.pk.x.toString(),
    newOwnerPkY: newOwner.pk.y.toString(),
    newSalt: newSalt.toString(),
  };

  return {
    oldOwner, newOwner, oldNftHash, newNftHash, nullifier,
    nftId, collectionAddress, oldSalt, newSalt, circuitInputs,
  };
}

export async function generateF1Proof(circuitInputs: Record<string, unknown>) {
  return generateProof(CIRCUIT_NAMES.PRIVATE_NFT_TRANSFER, circuitInputs);
}

// ─── F4: Loot Box Open ───

export type F4SetupResult = {
  owner: Keypair;
  boxCommitment: bigint;
  outcomeCommitment: bigint;
  vrfOutput: bigint;
  nullifier: bigint;
  boxId: bigint;
  boxType: bigint;
  itemId: bigint;
  itemRarity: bigint;
  rarityLabel: string;
  circuitInputs: Record<string, unknown>;
};

function determineRarity(
  vrfMod: number,
  thresholds: number[],
): { rarity: number; label: string } {
  if (vrfMod < thresholds[0]) return { rarity: 0, label: "Legendary" };
  if (vrfMod < thresholds[1]) return { rarity: 1, label: "Epic" };
  if (vrfMod < thresholds[2]) return { rarity: 2, label: "Rare" };
  return { rarity: 3, label: "Common" };
}

export async function setupF4BoxOpen(
  boxId: bigint,
  boxType: bigint,
  itemId: bigint,
  thresholds: number[] = [100, 500, 2000, 10000],
): Promise<F4SetupResult> {
  const owner = await generateKeypair();
  const boxSalt = randomSalt();
  const itemSalt = randomSalt();

  const boxCommitment = await poseidonHash([
    owner.pk.x, owner.pk.y, boxId, boxType, boxSalt,
  ]);
  const nullifier = await poseidonHash([boxId, boxSalt, owner.sk]);
  const vrfOutput = await poseidonHash([owner.sk, nullifier]);

  // 14-bit extraction for VRF modulo
  const lower14 = Number(vrfOutput & 0x3FFFn);
  const vrfMod = lower14 < 10000 ? lower14 : lower14 - 10000;
  const { rarity, label } = determineRarity(vrfMod, thresholds);
  const itemRarity = BigInt(rarity);

  const outcomeCommitment = await poseidonHash([
    owner.pk.x, owner.pk.y, itemId, itemRarity, itemSalt,
  ]);

  const circuitInputs = {
    boxCommitment: boxCommitment.toString(),
    outcomeCommitment: outcomeCommitment.toString(),
    vrfOutput: vrfOutput.toString(),
    boxId: boxId.toString(),
    nullifier: nullifier.toString(),
    ownerPkX: owner.pk.x.toString(),
    ownerPkY: owner.pk.y.toString(),
    ownerSk: owner.sk.toString(),
    boxSalt: boxSalt.toString(),
    boxType: boxType.toString(),
    itemId: itemId.toString(),
    itemRarity: itemRarity.toString(),
    itemSalt: itemSalt.toString(),
    rarityThresholds: thresholds.map(String),
  };

  return {
    owner, boxCommitment, outcomeCommitment, vrfOutput, nullifier,
    boxId, boxType, itemId, itemRarity, rarityLabel: label, circuitInputs,
  };
}

export async function generateF4Proof(circuitInputs: Record<string, unknown>) {
  return generateProof(CIRCUIT_NAMES.LOOT_BOX_OPEN, circuitInputs);
}

// ─── F5: Gaming Item Trade ───

export type F5SetupResult = {
  seller: Keypair;
  buyer: Keypair;
  oldItemHash: bigint;
  newItemHash: bigint;
  paymentNoteHash: bigint;
  nullifier: bigint;
  gameId: bigint;
  itemId: bigint;
  circuitInputs: Record<string, unknown>;
};

export async function setupF5Trade(
  itemId: bigint,
  itemType: bigint,
  itemAttributes: bigint,
  gameId: bigint,
  price: bigint,
  paymentToken: bigint,
): Promise<F5SetupResult> {
  const seller = await generateKeypair();
  const buyer = await generateKeypair();
  const oldSalt = randomSalt();
  const newSalt = randomSalt();
  const paymentSalt = randomSalt();

  const oldItemHash = await poseidonHash([
    seller.pk.x, seller.pk.y, itemId, itemType, itemAttributes, gameId, oldSalt,
  ]);
  const newItemHash = await poseidonHash([
    buyer.pk.x, buyer.pk.y, itemId, itemType, itemAttributes, gameId, newSalt,
  ]);
  const paymentNoteHash =
    price === 0n
      ? 0n
      : await poseidonHash([
          seller.pk.x, seller.pk.y, price, paymentToken, paymentSalt,
        ]);
  const nullifier = await poseidonHash([itemId, oldSalt, seller.sk]);

  const circuitInputs = {
    oldItemHash: oldItemHash.toString(),
    newItemHash: newItemHash.toString(),
    paymentNoteHash: paymentNoteHash.toString(),
    gameId: gameId.toString(),
    nullifier: nullifier.toString(),
    sellerPkX: seller.pk.x.toString(),
    sellerPkY: seller.pk.y.toString(),
    sellerSk: seller.sk.toString(),
    oldSalt: oldSalt.toString(),
    buyerPkX: buyer.pk.x.toString(),
    buyerPkY: buyer.pk.y.toString(),
    newSalt: newSalt.toString(),
    itemId: itemId.toString(),
    itemType: itemType.toString(),
    itemAttributes: itemAttributes.toString(),
    price: price.toString(),
    paymentToken: paymentToken.toString(),
    paymentSalt: paymentSalt.toString(),
  };

  return {
    seller, buyer, oldItemHash, newItemHash, paymentNoteHash,
    nullifier, gameId, itemId, circuitInputs,
  };
}

export async function generateF5Proof(circuitInputs: Record<string, unknown>) {
  return generateProof(CIRCUIT_NAMES.GAMING_ITEM_TRADE, circuitInputs);
}

// ─── Shared helpers ───

export function encryptedNoteBytes(): Uint8Array {
  return new TextEncoder().encode("demo");
}

export function formatProofArgs(proof: SolidityProof) {
  return [proof.a, proof.b, proof.c] as const;
}
