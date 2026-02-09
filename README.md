# NFT Gaming ZK-DEX

A **Privacy-Preserving NFT Gaming DEX** project based on ZK-SNARKs. This system protects personal information during NFT ownership verification and transfer, providing a secure environment for NFT trading and game item exchange with enhanced on-chain privacy.

## 🚀 Project Overview

This project utilizes Zero-Knowledge Proofs (ZKPs) to solve the "exposure of ownership" issue, a drawback of traditional NFT transfer methods. Users can privately transfer assets and prove ownership without revealing specific transaction paths or asset details.

### Key Features (F1: Private NFT Transfer)
- **Private NFT Transfer**: Transfer NFT ownership using a UTXO-style "Note" system.
- **On-chain Verification**: Instant validation of transfer validity on-chain via Groth16 proofs.
- **Double-Spend Prevention**: Implementation of a Nullifier mechanism to block duplicate usage of the same asset.
- **Data Security**: ECDH (Elliptic-Curve Diffie-Hellman) encryption ensures only the recipient can decrypt their asset data.

---

## 🛠 Tech Stack

- **Smart Contracts**: `Solidity 0.8.20`, `Hardhat`
- **ZK Logic**: `Circom 2.1.0`, `SnarkJS`, `Groth16`
- **Hashing & Crypto**: `Poseidon Hash`, `BabyJubJub Curve`, `ECDH`
- **Frontend**: `React`, `TypeScript`, `Vite`, `Ethers.js`
- **Testing**: `Mocha`, `Chai`

---

## 📂 Project Structure

```text
.
├── circuits/           # Circom ZK circuits (Ownership proof & transfer logic)
├── contracts/          # Ethereum smart contracts (PrivateNFT, Verifiers)
├── frontend/           # React-based frontend dashboard
├── scripts/            # Scripts for circuit compilation & deployment
└── test/               # Circuit unit tests & integration tests
```

---

## ✅ Test Status (24/24 Passed)

All core features have been tested and verified for stability.

### 1. Circuit Unit Tests (11)
- Valid proof generation & verification: Passed
- Tampering attempts (invalid Secret Key, NFT ID, Salt, etc.): Blocked
- Public Signal manipulation: Verification failed as expected

### 2. Hardhat Integration Tests (13)
- NFT registration & duplicate registration rejection: Passed
- Transfer via real ZK proofs & chain transfers (A→B→C): Successful
- **Security Checks**: Double-spend (same nullifier), spent note usage, and non-existent note transfer attempts: Blocked
- Event triggers (NFTRegistered, NFTTransferred): Verified

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
cd frontend && npm install
```

### 2. Compile ZK Circuits
```bash
npm run compile:circuits
```

### 3. Compile Contracts & Run Tests
```bash
npm run compile:contracts
npm test
```

### 4. Run Locally
```bash
# Run local node
npm run node:local
# Deploy contracts
npm run deploy:local
# Start frontend
npm run dev:frontend
```

---

## 🛡 Security Logic

- **Note Hash**: Assets are identified using `Poseidon(pkX, pkY, nftId, collectionAddress, salt)` for cryptographic privacy.
- **Zero-Knowledge Proof**: Mathematically proves legitimate ownership without revealing the sender's private key.
- **Nullifier**: Generates a unique value for each transfer using `ComputeNullifier(itemId, salt, sk)`, recorded on-chain to prevent replay attacks.

---

## 🌐 Language
- [Korean (한국어)](./README_KR.md)
