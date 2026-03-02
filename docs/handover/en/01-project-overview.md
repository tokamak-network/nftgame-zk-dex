# 1. Project Overview

[< Back to Table of Contents](./README.md)

---

## 1.1 Purpose

Build a **gaming DEX that guarantees NFT ownership privacy while allowing on-chain verification** using ZK-SNARKs.

Problems with existing NFT transfers:
- When transferring NFTs on the blockchain, **owner wallet addresses, transaction paths, and held assets** are all public.
- When trading game items, the opponent's holdings are exposed.

This project's solution:
- Wrap assets using a UTXO-style "Note" system.
- Prove ownership with ZK proofs while keeping **specific owners/transaction paths private**.
- Prevent double-spending with Nullifiers.

## 1.2 Target Users

| User Type | Description |
|---|---|
| NFT Gamers | Users who want to trade in-game items/cards in a privacy-guaranteed environment |
| NFT Collectors | Users who want to transfer NFTs while keeping ownership private |
| Game Developers | Teams looking to integrate a ZK-based privacy layer into games |
| Blockchain Researchers | Developers looking to learn about Groth16/Circom-based ZK applications |

## 1.3 Core Features

| Feature ID | Feature Name | Description | Status |
|---|---|---|---|
| F1 | Private NFT Transfer | Private NFT ownership transfer using UTXO-style Note system | Done |
| F4 | Loot Box Open | Verifiable random loot box opening based on Poseidon VRF | Done |
| F5 | Gaming Item Trade | P2P game item trade (Escrow payment + Game ecosystem isolation) | Done |
| F8 | Card Draw Verify | 52-card draw verifying Fisher-Yates shuffle within ZK circuits | Done |
| F9 | Card Draw Game | Multiplayer card game based on F8 (Commit-Reveal randomness) | Done |

### Key Points by Feature

**F1: Private NFT Transfer**
- Transfer NFTs using a UTXO-style "Note" system
- Immediate on-chain verification with Groth16 proofs
- Block double-spending with Nullifiers
- Only the recipient can decrypt Note data with ECDH encryption

**F4: Loot Box Open**
- Deterministic yet unpredictable randomness with Poseidon VRF
- Drop rates decided by cumulative rarity thresholds (1% Legendary, 4% Epic, 15% Rare, 80% Common)
- Block re-opening the same box with Nullifiers

**F5: Gaming Item Trade**
- Preserve item properties with 7-input Poseidon commitments
- Supports both paid trades + free gifts
- Block item movement between games with `gameId` binding
- Secure payment based on ERC20 Escrow

**F8: Card Draw Verify**
- Verify the entire 52-card Fisher-Yates shuffle within ZK circuits (~99K constraints)
- Deck is Persistent (not consumed) — possible to draw multiple cards from the same deck
- Block duplicate draws at the same position with drawIndex mapping

**F9: Card Draw Game**
- Multiplayer (2~5 players) based on F8
- Block seed manipulation with Commit-Reveal + blockhash + prevrandao
- Highest card wins, prize paid after deducting 10% fee

## 1.4 Tech Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Smart Contracts | Solidity + Hardhat + Foundry | 0.8.20 / 2.22.0 / latest |
| ZK Circuits | Circom + SnarkJS (Groth16) | 2.1.0 / 0.7.6 |
| Cryptography | Poseidon Hash + BabyJubJub + ECDH | circomlibjs 0.1.7 |
| Frontend | React + TypeScript + Vite + Tailwind | 19.2.0 / 5.9.3 / 7.3.1 / 4.1.18 |
| Blockchain Conn. | ethers.js + MetaMask | 6.16.0 |
| Testing | Mocha/Chai + Hardhat + Foundry/Forge | 170/170 Passing |
| Runtime | Node.js | >=18 (Recommended 20) |

> See [02-System Architecture](./02-architecture.md) for detailed version info.
