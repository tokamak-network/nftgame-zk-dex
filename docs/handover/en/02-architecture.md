# 2. System Architecture

[< Back to Table of Contents](./README.md)

---

## 2.1 Overall Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                           │
│  React 19.2.0 + TypeScript 5.9.3 + Vite 7.3.1 + Tailwind 4.1.18  │
│                                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Pages   │  │   Hooks   │  │ Proof Gen    │  │  Note Store   │ │
│  │ (7 routes│  │ useWallet  │  │ snarkjs WASM │  │ localStorage  │ │
│  │  F1~F9)  │  │ useContract│  │ circomlibjs  │  │ per-address   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  └───────────────┘ │
│       │               │               │                             │
│       └───────────────┼───────────────┘                             │
│                       │                                             │
│              ethers.js 6.16.0 (JSON-RPC)                           │
│                       │                                             │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   EVM Blockchain (Hardhat Local)                    │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐               │
│  │ NFTNoteBase │  │  MockERC20  │  │  Groth16     │               │
│  │ (Base)      │  │  (TON)      │  │  Verifiers   │               │
│  └──────┬──────┘  └─────────────┘  │  (4 contracts│               │
│         │                           └──────────────┘               │
│  ┌──────┴──────────────────────────────────────┐                   │
│  │ PrivateNFT │ LootBoxOpen │ GamingItemTrade  │                   │
│  │ CardDraw   │ CardDrawGame                   │                   │
│  └─────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                        ▲
                        │ (circuit artifacts: .wasm, .zkey)
┌───────────────────────┴─────────────────────────────────────────────┐
│                     ZK Circuit Layer (Circom 2.1.0)                 │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   Main Circuits     │  │   Utility Circuits                   │ │
│  │ private_nft_transfer │  │ nullifier, poseidon_vrf,            │ │
│  │ loot_box_open       │  │ fisher_yates, proof_of_ownership,    │ │
│  │ gaming_item_trade   │  │ deck_commitment, array_read,         │ │
│  │ card_draw           │  │ get_pubkey                           │ │
│  └─────────────────────┘  └──────────────────────────────────────┘ │
│                                                                     │
│  Proof System: Groth16 | Hash: Poseidon | Curve: BabyJubJub       │
│  PTAU: powersOfTau28_hez_final_22.ptau (2^22)                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 2.2 Roles by Layer

| Layer | Role | Key Technologies |
|---|---|---|
| **Frontend** | Wallet connection, ZK proof generation (browser), TX transmission, Note management | React, snarkjs WASM, ethers.js |
| **Blockchain** | Proof verification, Note state management, Nullifier recording, Payment processing | Solidity, Groth16 Verifier |
| **ZK Circuit** | Ownership proof, Commitment calculation, VRF, Shuffle verification circuit definition | Circom, Poseidon, BabyJubJub |

## 2.3 Tech Stack Details (Including Versions)

### Smart Contracts

| Tech | Version | Purpose |
|---|---|---|
| Solidity | 0.8.20 | Smart contract language |
| Hardhat | 2.22.0 | Contract compilation, deployment, testing |
| Foundry (Forge) | latest (git submodule) | Solidity native testing + Fuzz testing |
| OpenZeppelin Contracts | 5.0.0 | Standard contracts like ERC20 |
| ethers.js | 6.11.1 (backend) / 6.16.0 (frontend) | Blockchain interaction |

### Zero-Knowledge Proofs (ZK)

| Tech | Version | Purpose |
|---|---|---|
| Circom | 2.1.0 | ZK circuit writing language |
| SnarkJS | 0.7.6 | Groth16 proof generation/verification |
| circomlibjs | 0.1.7 | Poseidon hash, BabyJubJub operations |
| ffjavascript | 0.3.1 | Finite field arithmetic library |

### Frontend

| Tech | Version | Purpose |
|---|---|---|
| React | 19.2.0 | UI framework |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.3.1 | Build tool |
| Tailwind CSS | 4.1.18 | Styling (Neon theme) |
| React Router | 7.13.0 | SPA routing |

### Testing

| Tech | Version | Purpose |
|---|---|---|
| Mocha | 10.2.0 | ZK circuit testing |
| Chai | 4.3.0 | Assertion library |
| Hardhat Toolbox | 4.0.0 | Contract unit + integration testing |
| Foundry/Forge | latest | Fuzz testing (256 runs) |

### Runtime

| Tech | Version | Remarks |
|---|---|---|
| Node.js | >=18 (Recommended: 20, see `.nvmrc`) | Runtime |
| npm | (Included with Node.js) | Package manager |

## 2.4 External Dependencies

| Dependency | Type | Description |
|---|---|---|
| MetaMask | Browser extension | Wallet connection (`window.ethereum`) |
| Circom Compiler | System install | Necessary for circuit compilation (Separate install) |
| Powers of Tau File | File download | `circuits/ptau/powersOfTau28_hez_final_22.ptau` (~4.5GB) |
| Hermez PTAU Ceremony | External dependency | Groth16 Phase 1 trust setup |
| forge-std | git submodule | Foundry test standard library |
| Google Fonts | CDN | Orbitron, Rajdhani, JetBrains Mono |

## 2.5 Contract Inheritance Structure

```
NFTNoteBase (Note/Nullifier state management)
  ├── PrivateNFT        (F1)
  ├── LootBoxOpen       (F4)  + IERC20 paymentToken
  ├── GamingItemTrade   (F5)  + IERC20 paymentToken
  ├── CardDraw          (F8)
  └── CardDrawGame      (F9)  + IERC20 paymentToken (Not independent inheritance, doesn't inherit CardDraw)

IGroth16Verifier (Interface)
  ├── INFTTransferVerifier      → PrivateNftTransferVerifier.sol
  ├── ILootBoxVerifier          → LootBoxOpenVerifier.sol
  ├── IGamingItemTradeVerifier  → GamingItemTradeVerifier.sol
  └── ICardDrawVerifier         → CardDrawVerifier.sol

MockERC20 (Inherits OpenZeppelin ERC20, "TokamakNetwork" / "TON")
```

## 2.6 Data Flow Summary

```
┌────────────────┐   ZK Proof    ┌──────────────────┐
│   User Browser │ ─────────────→│  Smart Contract  │
│                │               │                  │
│ 1. Gen Keypair │  (a, b, c,   │ 1. Verify Proof  │
│ 2. Calc Note   │   publicInputs│ 2. Note State Chg│
│ 3. Gen Proof   │   )           │ 3. Rec Nullifier │
│ 4. Send TX     │               │ 4. Emit Event    │
│                │               │                  │
│ snarkjs WASM   │  ◄────────── │ Groth16Verifier   │
│ circomlibjs    │  TX Receipt   │ (Precompiled     │
│ ethers.js      │               │  ecPairing)      │
└────────────────┘               └──────────────────┘
        │
        ▼
┌────────────────┐
│  localStorage  │
│ Save/Load Note │
│ (per-address)  │
└────────────────┘
```

> No REST API server. All data is stored on-chain (smart contracts) + off-chain (localStorage).
