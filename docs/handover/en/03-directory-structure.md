# 3. Directory Structure

[< Back to Table of Contents](./README.md)

---

## 3.1 Overall Tree

```
nftGame-zk-dex/
├── circuits/                          # ZK circuit code (Circom)
│   ├── main/                          #   4 core feature circuits
│   │   ├── private_nft_transfer.circom  # F1: NFT private transfer
│   │   ├── loot_box_open.circom         # F4: Lootbox opening
│   │   ├── gaming_item_trade.circom     # F5: Item trade
│   │   └── card_draw.circom             # F8: Card draw (52-card shuffle)
│   ├── utils/                         #   Shared utility circuits
│   │   ├── babyjubjub/                  # Elliptic curve ops, ownership proof
│   │   ├── vrf/                         # Poseidon VRF (verifiable randomness)
│   │   ├── shuffle/                     # Fisher-Yates shuffle verification
│   │   ├── poseidon/                    # Poseidon hash, deck commitment
│   │   ├── array/                       # Variable index array access
│   │   ├── nullifier.circom             # Nullifier calculation
│   │   └── pack/                        # Data packing
│   ├── build/                         #   Compilation artifacts (r1cs, wasm, zkey)
│   └── ptau/                          #   Powers of Tau files (.gitignore)
│
├── contracts/                         # Solidity smart contracts
│   ├── NFTNoteBase.sol                  # Base: Note/Nullifier state management
│   ├── PrivateNFT.sol                   # F1
│   ├── LootBoxOpen.sol                  # F4
│   ├── GamingItemTrade.sol              # F5
│   ├── CardDraw.sol                     # F8
│   ├── CardDrawGame.sol                 # F9
│   ├── verifiers/                     #   Auto-generated Groth16 verifiers
│   │   ├── IGroth16Verifier.sol           # Verifier interfaces (4 types)
│   │   ├── PrivateNftTransferVerifier.sol # F1 verifier
│   │   ├── LootBoxOpenVerifier.sol        # F4 verifier
│   │   ├── GamingItemTradeVerifier.sol    # F5 verifier
│   │   └── CardDrawVerifier.sol           # F8 verifier
│   └── test/                          #   Mock contracts for testing
│       ├── Mock*Verifier.sol              # Always returns true
│       └── MockERC20.sol                  # Test TON token
│
├── frontend/                          # React frontend
│   ├── src/
│   │   ├── pages/                       # Page components (7 routes)
│   │   ├── components/                  # Reusable components
│   │   ├── hooks/                       # React hooks
│   │   ├── lib/                         # Utilities
│   │   ├── abi/                         # Contract ABI JSONs
│   │   ├── config/                      # deployedAddresses.json
│   │   ├── App.tsx                      # Router + WalletProvider
│   │   ├── main.tsx                     # Entry point
│   │   └── index.css                    # Global style (Neon theme)
│   ├── public/circuits/                 # .wasm, .zkey for browser
│   ├── vite.config.ts                   # Vite build config
│   └── package.json                     # Frontend dependencies
│
├── scripts/                           # Build/Deploy scripts
│   ├── compile-circuit.js               # Circuit compilation pipeline
│   ├── deploy.js                        # Contract deployment (Hardhat)
│   ├── copy-frontend-assets.js          # Copy assets to frontend
│   └── lib/                           #   JS cryptographic utilities
│       ├── snarkjsUtils.js                # Proof generation/verification helper
│       ├── Note.js / Wallet.js            # Note/Wallet classes
│       ├── circomlibBabyJub.js            # BabyJubJub arithmetic
│       ├── ecdhCrypto.js                  # ECDH encryption
│       └── util.js                        # General utils
│
├── test/                              # Test suites
│   ├── circuits/                        # Circuit unit tests (Mocha)
│   ├── foundry/                         # Foundry tests (Solidity)
│   ├── *.test.js                        # Hardhat unit tests (Mock verifiers)
│   └── *.integration.test.js            # Hardhat integration tests (Real ZK proofs)
│
├── forge-out/                         # Foundry build output
├── artifacts/                         # Hardhat build output
├── lib/forge-std/                     # Foundry standard library (git submodule)
│
├── hardhat.config.js                  # Hardhat configuration
├── foundry.toml                       # Foundry configuration
├── remappings.txt                     # Solidity import path mappings
├── package.json                       # Root dependencies
├── .nvmrc                             # Node.js version (v20)
└── .gitmodules                        # Git submodules (forge-std)
```

## 3.2 Quick Reference for Key Files

### Configuration Files

| File | Description |
|---|---|
| `hardhat.config.js` | Solidity 0.8.20, optimizer 200 runs, via-IR, chainId 1337 |
| `foundry.toml` | src=contracts, out=forge-out, test=test/foundry, fuzz 256 runs |
| `remappings.txt` | `forge-std/` → `lib/forge-std/src/`, `@openzeppelin/` → `node_modules/` |
| `frontend/vite.config.ts` | React, Tailwind, port 3000, COOP/COEP headers, `/api` proxy |
| `.nvmrc` | Node.js v20 |

### Frequently Modified Files

| Purpose | File Path |
|---|---|
| Contract deployment | `scripts/deploy.js` |
| Circuit compilation | `scripts/compile-circuit.js` |
| Deployed addresses | `frontend/src/config/deployedAddresses.json` |
| Wallet connection | `frontend/src/hooks/useWallet.tsx` |
| Contract instances | `frontend/src/lib/contracts.ts` |
| ZK proof generation | `frontend/src/lib/proofGenerator.ts` |
| Crypto utilities | `frontend/src/lib/crypto.ts` |
| Note store | `frontend/src/lib/noteStore.ts` |
| Route configuration | `frontend/src/App.tsx` |

### Frontend Routes

| Path | Component | Description |
|---|---|---|
| `/` | `HomePage` | Feature intro cards |
| `/f1-private-nft` | `F1PrivateNFTPage` | 4-step NFT transfer |
| `/f4-loot-box` | `F4LootBoxPage` | 5-step lootbox |
| `/f5-item-trade` | `F5GamingItemTradePage` | Tab-based trading |
| `/f8-card-draw` | `F8CardDrawPage` | Single card draw |
| `/f9-card-game` | `CardDrawGamePage` | Multiplayer |
| `/my-notes` | `MyNotesPage` | Note management |
