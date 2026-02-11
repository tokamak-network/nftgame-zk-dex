# ZK Circuit Architecture

## Overview

All circuits use the **Groth16** proof system on the **BN128** elliptic curve. Each circuit proves a specific property about private data without revealing it.

### Shared Utilities

| Circuit | Location | Purpose |
|---------|----------|---------|
| `ProofOfOwnership` | `utils/babyjubjub/proof_of_ownership.circom` | Proves sk matches pk on BabyJubJub |
| `GetPubKey` | `utils/babyjubjub/get_pubkey.circom` | Derives pk = sk * Base8 |
| `ComputeNullifier` | `utils/nullifier.circom` | Poseidon(itemId, salt, sk) |
| `PoseidonNote` | `utils/poseidon/poseidon_note.circom` | 7-input Poseidon for note hashing |
| `PoseidonVRF` | `utils/vrf/poseidon_vrf.circom` | Poseidon(sk, seed) VRF for F4/F8 |

### Key Design Decisions

- **Poseidon Hash**: Used instead of SHA256 for ~100x fewer constraints (~300 vs ~30,000 per hash).
- **BabyJubJub Curve**: SNARK-friendly elliptic curve for key derivation and ownership proofs.
- **ProofOfOwnership**: Uses `pk[2]` array (NOT separate pkX/pkY signals) — both `ProofOfOwnership` and `ProofOfOwnershipStrict` templates follow this pattern.
- **No ternary operators**: Circom does not support `? :` syntax. Conditional logic uses `IsZero()` with arithmetic: `result <== (1 - flag) * value`.

---

## F1: Private NFT Transfer

**File**: `circuits/main/private_nft_transfer.circom`

### Purpose

Privately transfer NFT ownership from one party to another, proving:
1. Sender owns the old NFT note
2. Old note hash matches the committed hash
3. New note is correctly formed for the recipient
4. Nullifier is correctly computed

### Note Structure

```
NFT Note = Poseidon(pkX, pkY, nftId, collectionAddress, salt)
         = Poseidon(5 inputs)
```

### Signal Specification

#### Public Inputs (5)

| # | Signal | Type | Description |
|---|--------|------|-------------|
| 0 | `oldNftHash` | field | Old NFT note commitment |
| 1 | `newNftHash` | field | New NFT note commitment |
| 2 | `nftId` | field | NFT token ID |
| 3 | `collectionAddress` | field | NFT collection contract address |
| 4 | `nullifier` | field | Nullifier for double-spend prevention |

#### Private Inputs (7)

| Signal | Description |
|--------|-------------|
| `oldOwnerPkX` | Old owner's BabyJubJub public key X |
| `oldOwnerPkY` | Old owner's BabyJubJub public key Y |
| `oldOwnerSk` | Old owner's secret key |
| `oldSalt` | Salt of old note |
| `newOwnerPkX` | New owner's BabyJubJub public key X |
| `newOwnerPkY` | New owner's BabyJubJub public key Y |
| `newSalt` | Salt of new note |

### Constraint Analysis

| Metric | Value |
|--------|-------|
| Non-linear constraints | 4,862 |
| Linear constraints | 1,542 |
| Total wires | ~6,400 |
| Template instances | ~230 |

### Circuit Flow

```
1. oldNft = Poseidon(oldOwnerPkX, oldOwnerPkY, nftId, collectionAddress, oldSalt)
   → assert: oldNft.out === oldNftHash

2. ownership = ProofOfOwnership(pk=[oldOwnerPkX, oldOwnerPkY], sk=oldOwnerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(nftId, oldSalt, oldOwnerSk)
   → assert: nullifierCalc.out === nullifier

4. newNft = Poseidon(newOwnerPkX, newOwnerPkY, nftId, collectionAddress, newSalt)
   → assert: newNft.out === newNftHash
```

---

## F4: Loot Box Open

**File**: `circuits/main/loot_box_open.circom`

### Purpose

Open a sealed loot box and determine a random item rarity, proving:
1. Owner holds the sealed box note
2. VRF output is correctly computed from owner's secret key
3. Rarity tier is correctly determined from VRF output and thresholds
4. Outcome note is correctly formed with the determined item
5. Nullifier prevents double-opening

### Shared Utility: PoseidonVRF

**File**: `circuits/utils/vrf/poseidon_vrf.circom`

A lightweight VRF component reusable by F4 (loot box) and F8 (card draw):

```
PoseidonVRF(sk, seed) → Poseidon(sk, seed)
```

- **Deterministic**: Same sk + seed always produces the same output
- **Unpredictable**: Without sk, output cannot be predicted
- **Efficient**: ~300 constraints (single Poseidon hash)

### Note Structures

```
Box Note     = Poseidon(pkX, pkY, boxId, boxType, boxSalt)
             = Poseidon(5 inputs)

Outcome Note = Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
             = Poseidon(5 inputs)
```

### Signal Specification

#### Public Inputs (5)

| # | Signal | Type | Description |
|---|--------|------|-------------|
| 0 | `boxCommitment` | field | Sealed box note commitment |
| 1 | `outcomeCommitment` | field | Outcome item note commitment |
| 2 | `vrfOutput` | field | VRF output (Poseidon(sk, nullifier)) |
| 3 | `boxId` | field | Box identifier |
| 4 | `nullifier` | field | Nullifier for double-open prevention |

#### Private Inputs (12)

| Signal | Description |
|--------|-------------|
| `ownerPkX` | Owner's BabyJubJub public key X |
| `ownerPkY` | Owner's BabyJubJub public key Y |
| `ownerSk` | Owner's secret key |
| `boxSalt` | Salt of box note |
| `boxType` | Box type identifier |
| `itemId` | Resulting item ID |
| `itemRarity` | Claimed rarity tier (0-3) |
| `itemSalt` | Salt for outcome note |
| `rarityThresholds[4]` | Cumulative probability thresholds |

### Constraint Analysis

| Metric | Value |
|--------|-------|
| Non-linear constraints | 5,491 |
| Linear constraints | 1,855 |
| Total wires | ~7,300 |
| Template instances | 234 |

### Circuit Flow

```
1. boxNote = Poseidon(ownerPkX, ownerPkY, boxId, boxType, boxSalt)
   → assert: boxNote.out === boxCommitment

2. ownership = ProofOfOwnership(pk=[ownerPkX, ownerPkY], sk=ownerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(boxId, boxSalt, ownerSk)
   → assert: nullifierCalc.out === nullifier

4. vrf = PoseidonVRF(sk=ownerSk, seed=nullifier)
   → assert: vrf.out === vrfOutput

5. Rarity Determination:
   lower14bits = vrfOutput & 0x3FFF  (via Num2Bits(254) → Bits2Num(14))
   vrfMod = lower14bits % 10000      (quotient guaranteed 0 or 1)
   for each tier i: isBelow[i] = LessThan(vrfMod < thresholds[i])
   matched[i] = isBelow[i] AND NOT isBelow[i-1]
   → assert: matched[itemRarity] === 1

6. Threshold Validity:
   → assert: thresholds are monotonically increasing
   → assert: thresholds[3] === 10000

7. outcomeNote = Poseidon(ownerPkX, ownerPkY, itemId, itemRarity, itemSalt)
   → assert: outcomeNote.out === outcomeCommitment
```

### Rarity Logic Detail

The 14-bit extraction ensures safe field arithmetic:

| Step | Operation | Range |
|------|-----------|-------|
| Extract | `vrfOutput & 0x3FFF` | 0–16383 |
| Modulo | `lower14bits % 10000` | 0–9999 |
| Quotient | 0 or 1 (safe for field arithmetic) | 0–1 |

Default thresholds (example):

| Tier | Rarity | Threshold | Probability |
|------|--------|-----------|-------------|
| 0 | Legendary | 100 | 1% |
| 1 | Epic | 500 | 4% |
| 2 | Rare | 2000 | 15% |
| 3 | Common | 10000 | 80% |

---

## F5: Gaming Item Trade

**File**: `circuits/main/gaming_item_trade.circom`

### Purpose

Privately trade gaming items between players with optional payment, proving:
1. Seller owns the old item note
2. Old item note hash matches the committed hash
3. New item note preserves item identity (itemId, itemType, itemAttributes)
4. Game ecosystem (gameId) is preserved
5. Nullifier is correctly computed
6. Payment note is correctly formed (if paid) or zero (if gift)

### Note Structures

```
Item Note    = Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
             = Poseidon(7 inputs)

Payment Note = Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
             = Poseidon(5 inputs)
```

### Signal Specification

#### Public Inputs (5)

| # | Signal | Type | Description |
|---|--------|------|-------------|
| 0 | `oldItemHash` | field | Old item note commitment |
| 1 | `newItemHash` | field | New item note commitment |
| 2 | `paymentNoteHash` | field | Payment note commitment (0 for gifts) |
| 3 | `gameId` | field | Game ecosystem identifier |
| 4 | `nullifier` | field | Nullifier for double-spend prevention |

#### Private Inputs (13)

| Signal | Description |
|--------|-------------|
| `sellerPkX` | Seller's BabyJubJub public key X |
| `sellerPkY` | Seller's BabyJubJub public key Y |
| `sellerSk` | Seller's secret key |
| `oldSalt` | Salt of old item note |
| `buyerPkX` | Buyer's BabyJubJub public key X |
| `buyerPkY` | Buyer's BabyJubJub public key Y |
| `newSalt` | Salt of new item note |
| `itemId` | Item token ID |
| `itemType` | Item type (weapon, armor, etc.) |
| `itemAttributes` | Encoded item stats/attributes |
| `price` | Payment amount (0 = gift) |
| `paymentToken` | Payment token type |
| `paymentSalt` | Salt for payment note |

### Constraint Analysis

| Metric | Value |
|--------|-------|
| Non-linear constraints | 5,309 |
| Linear constraints | 2,425 |
| Total wires | 7,747 |
| Template instances | 237 |

### Circuit Flow

```
1. oldItem = Poseidon(sellerPkX, sellerPkY, itemId, itemType, itemAttributes, gameId, oldSalt)
   → assert: oldItem.out === oldItemHash

2. ownership = ProofOfOwnership(pk=[sellerPkX, sellerPkY], sk=sellerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(itemId, oldSalt, sellerSk)
   → assert: nullifierCalc.out === nullifier

4. newItem = Poseidon(buyerPkX, buyerPkY, itemId, itemType, itemAttributes, gameId, newSalt)
   → assert: newItem.out === newItemHash

5. paymentNote = Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
   isGift = IsZero(price)
   expectedPaymentHash = (1 - isGift.out) * paymentNote.out
   → assert: paymentNoteHash === expectedPaymentHash
```

### Payment Logic Detail

The gift/paid branching uses arithmetic instead of conditionals:

| Mode | price | isGift.out | expectedPaymentHash | paymentNoteHash must be |
|------|-------|------------|---------------------|------------------------|
| Gift | 0 | 1 | (1-1) * hash = 0 | 0 |
| Paid | >0 | 0 | (1-0) * hash = hash | Poseidon(seller, price, token, salt) |

---

## Compilation Pipeline

For each circuit, the build script (`scripts/compile-circuit.js`) executes:

```
circom <circuit>.circom --r1cs --wasm --sym -o build/
   ↓
snarkjs groth16 setup <circuit>.r1cs <ptau> <circuit>_0.zkey
   ↓
snarkjs zkey contribute <circuit>_0.zkey <circuit>.zkey
   ↓
snarkjs zkey export verificationkey <circuit>.zkey <circuit>_vkey.json
   ↓
snarkjs zkey export solidityverifier <circuit>.zkey <Name>Verifier.sol
   ↓
Copy wasm/zkey/vkey to frontend/public/circuits/
```

### Build Artifacts

```
circuits/build/<circuit_name>/
├── <name>.r1cs              # Constraint system
├── <name>.sym               # Symbol table
├── <name>.zkey              # Proving key (~10-20 MB)
├── <name>_vkey.json         # Verification key (~2 KB)
└── <name>_js/
    └── <name>.wasm          # Witness generator (~1-2 MB)
```
