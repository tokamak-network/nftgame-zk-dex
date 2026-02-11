# NFT Gaming ZK-DEX

A **Privacy-Preserving NFT Gaming DEX** project based on ZK-SNARKs. This system protects personal information during NFT ownership verification and transfer, providing a secure environment for NFT trading and game item exchange with enhanced on-chain privacy.

## Project Overview

This project utilizes Zero-Knowledge Proofs (ZKPs) to solve the "exposure of ownership" issue, a drawback of traditional NFT transfer methods. Users can privately transfer assets and prove ownership without revealing specific transaction paths or asset details.

### Implemented Features

| Feature | Description | Status |
|---------|-------------|--------|
| **F1: Private NFT Transfer** | Private NFT ownership transfer with UTXO-style notes | Done |
| **F4: Loot Box Open** | Verifiable random loot box opening with Poseidon-based VRF | Done |
| **F5: Gaming Item Trade** | P2P game item trading with payment support & game ecosystem isolation | Done |
| **F8: Card Draw** | Verifiable random card draw system | Planned |

### F1: Private NFT Transfer
- **Private NFT Transfer**: Transfer NFT ownership using a UTXO-style "Note" system.
- **On-chain Verification**: Instant validation of transfer validity on-chain via Groth16 proofs.
- **Double-Spend Prevention**: Nullifier mechanism to block duplicate usage of the same asset.
- **Data Security**: ECDH encryption ensures only the recipient can decrypt their asset data.

### F4: Loot Box Open
- **Verifiable Randomness**: Poseidon-based VRF ensures unpredictable, deterministic outcomes.
- **Provably Fair**: Rarity tiers determined by VRF output against committed thresholds.
- **Single Opening**: Nullifier mechanism prevents box from being opened twice.
- **Reusable VRF Utility**: Shared `PoseidonVRF` component designed for F8 card shuffle integration.

### F5: Gaming Item Trade
- **Private Item Trading**: Trade game items with 7-input Poseidon note commitments preserving item properties.
- **Payment Support**: Supports both paid trades and free gifts (price=0).
- **Game Ecosystem Isolation**: `gameId` binding ensures items cannot cross between different game ecosystems.
- **Attribute Preservation**: `itemType` and `itemAttributes` are cryptographically guaranteed to be preserved across trades.

---

## Tech Stack

- **Smart Contracts**: `Solidity 0.8.20`, `Hardhat`
- **ZK Logic**: `Circom 2.1.0`, `SnarkJS`, `Groth16`
- **Hashing & Crypto**: `Poseidon Hash`, `BabyJubJub Curve`, `ECDH`
- **Frontend**: `React`, `TypeScript`, `Vite`, `Ethers.js`
- **Testing**: `Mocha`, `Chai`

---

## Project Structure

```text
.
├── circuits/
│   ├── main/                  # Main circuit files
│   │   ├── private_nft_transfer.circom   # F1 circuit
│   │   ├── loot_box_open.circom         # F4 circuit
│   │   └── gaming_item_trade.circom      # F5 circuit
│   ├── utils/                 # Shared utility circuits
│   │   ├── babyjubjub/        # Ownership proof, key derivation
│   │   ├── vrf/               # Poseidon-based VRF (shared F4/F8)
│   │   ├── nullifier.circom   # Nullifier computation
│   │   └── poseidon/          # Poseidon note hashing
│   ├── build/                 # Compiled circuit artifacts (r1cs, wasm, zkey)
│   └── ptau/                  # Powers of Tau ceremony file
├── contracts/
│   ├── NFTNoteBase.sol        # Base contract for note/nullifier management
│   ├── PrivateNFT.sol         # F1 main contract
│   ├── LootBoxOpen.sol        # F4 main contract
│   ├── GamingItemTrade.sol    # F5 main contract
│   ├── verifiers/             # Groth16 verifier contracts + interfaces
│   └── test/                  # Mock verifiers for unit testing
├── test/
│   ├── circuits/              # Circuit-level unit tests (snarkjs, no blockchain)
│   ├── PrivateNFT.test.js             # F1 contract unit tests (mock verifier)
│   ├── PrivateNFT.integration.test.js # F1 integration tests (real ZK proofs)
│   ├── LootBoxOpen.test.js                  # F4 contract unit tests (mock verifier)
│   ├── LootBoxOpen.integration.test.js      # F4 integration tests (real ZK proofs)
│   ├── GamingItemTrade.test.js             # F5 contract unit tests (mock verifier)
│   └── GamingItemTrade.integration.test.js # F5 integration tests (real ZK proofs)
├── scripts/
│   ├── compile-circuit.js     # Circuit compilation pipeline
│   └── lib/                   # JS crypto utilities (BabyJubJub, Poseidon, proof gen)
├── frontend/                  # React + TypeScript frontend
├── docs/                      # Documentation
│   ├── setup.md               # Environment setup guide
│   ├── testing.md             # Testing guide
│   ├── circuits.md            # ZK circuit architecture
│   └── contracts.md           # Smart contract architecture
└── hardhat.config.js
```

---

## Test Status (124/124 Passed)

All core features have been tested and verified across three frameworks.

### F1: Private NFT Transfer (38 tests)

| Category | Tests | Details |
|----------|-------|---------|
| Circuit Unit (Mocha) | 11 | Valid proof generation, invalid sk/nftId/salt, public signal tampering |
| Contract Unit - Hardhat (Mock) | 4 | Registration, duplicate rejection, transfer with mock verifier, nullifier reuse |
| Contract Unit - Foundry (Mock + Fuzz) | 14 | Registration, transfer, chaining, reverts, events, fuzz (256 runs) |
| Integration (Real ZK) | 9 | Real proof transfer, chained A->B->C, double-spend, event emission |

### F4: Loot Box Open (39 tests)

| Category | Tests | Details |
|----------|-------|---------|
| Circuit Unit (Mocha) | 15 | Valid open, different box types, VRF uniqueness, wrong sk/boxId/nullifier/vrfOutput/rarity/thresholds, tampering |
| Contract Unit - Hardhat (Mock) | 9 | Registration, duplicates, open with mock verifier, double-open, events |
| Contract Unit - Foundry (Mock + Fuzz) | 15 | Registration, open, multiple boxes, reverts, events, fuzz (256 runs) |
| Integration (Real ZK) | 9 | Real proof open, different box types, multiple boxes, double-open, events |

### F5: Gaming Item Trade (47 tests)

| Category | Tests | Details |
|----------|-------|---------|
| Circuit Unit (Mocha) | 12 | Paid trade, gift trade, wrong sk/itemId/gameId/nullifier/attributes/payment, tampering |
| Contract Unit - Hardhat (Mock) | 9 | Registration, duplicates, game isolation, paid/gift trade, nullifier reuse, events |
| Contract Unit - Foundry (Mock + Fuzz) | 17 | Registration, paid/gift trade, chaining, game isolation, reverts, events, fuzz (256 runs) |
| Integration (Real ZK) | 9 | Real proof paid/gift trade, chained A->B->C, double-spend, event emission |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Compile circuits (requires circom installed)
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js loot_box_open
node scripts/compile-circuit.js gaming_item_trade

# 3. Compile contracts
npx hardhat compile

# 4. Run all tests
npx hardhat test
npx mocha test/circuits/ --timeout 120000
forge test
```

See [docs/setup.md](docs/setup.md) for detailed environment setup and [docs/testing.md](docs/testing.md) for the full testing guide.

---

## Security Logic

### Note Structures

| Feature | Note Hash | Inputs |
|---------|-----------|--------|
| F1 (NFT) | `Poseidon(pkX, pkY, nftId, collectionAddress, salt)` | 5 |
| F4 (Box) | `Poseidon(pkX, pkY, boxId, boxType, boxSalt)` | 5 |
| F4 (Outcome) | `Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)` | 5 |
| F5 (Item) | `Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)` | 7 |
| F5 (Payment) | `Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)` | 5 |

### Core Mechanisms
- **Zero-Knowledge Proof**: Proves legitimate ownership without revealing the sender's private key.
- **Nullifier**: `Poseidon(itemId, salt, sk)` generates a unique value per transfer, recorded on-chain to prevent replay attacks.
- **Poseidon VRF**: `Poseidon(sk, seed)` provides deterministic, unpredictable randomness for loot boxes.
- **Game Isolation**: F5 items are bound to `gameId`, preventing cross-game item leakage.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup.md) | Environment prerequisites, installation, circuit compilation |
| [Testing Guide](docs/testing.md) | How to run each test suite, expected results |
| [Circuit Architecture](docs/circuits.md) | ZK circuit design, signal specs, constraint analysis |
| [Contract Architecture](docs/contracts.md) | Smart contract design, interfaces, inheritance |

---

## Language
- [Korean (한국어)](./README_KR.md)
