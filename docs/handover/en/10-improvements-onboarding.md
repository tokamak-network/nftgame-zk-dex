# 10. Future Improvements + Onboarding Guide

[< Back to Table of Contents](./README.md)

---

## Part A: Future Improvement Roadmap

### Short-term (1~2 weeks)

| Priority | Item | Description |
|---|---|---|
| P0 | Access Control Verification | Verify/Fix admin function access control in `LootBoxOpen`, `GamingItemTrade` |
| P0 | Apply SafeERC20 | Switch to OpenZeppelin `SafeERC20` library |
| P1 | Introduce .env Variables | Apply `dotenv` to `hardhat.config.js`, `deploy.js` |
| P1 | CI/CD Implementation | GitHub Actions: lint → compile → test (hardhat + forge + circuit) |
| P2 | Docker Environment | Dockerfile + docker-compose (Node.js + Circom + Hardhat) |

### Mid-term (1~2 months)

| Priority | Item | Description |
|---|---|---|
| P0 | External Security Audit | Request professional audit for ZK circuits + smart contracts |
| P0 | Multi-party Phase 2 | Production-ready Groth16 Phase 2 trusted setup |
| P1 | Testnet Deployment | Deploy and test on networks like Sepolia |
| P1 | Introduce Proxy Patterns | Upgradable structure with Transparent Proxy or UUPS |
| P2 | Encrypted Note Storage | localStorage → IndexedDB + Encryption |
| P2 | Proof Gen Optimization | Web Worker + WASM multi-threading optimization |

### Long-term (3 months+)

| Priority | Item | Description |
|---|---|---|
| **P0** | **TON Staking Integration** | **See details below regarding LotteryCandidate** |
| P1 | Mainnet Deployment | L2 (Optimism/Base/Arbitrum) or EVM-compatible chains |
| P1 | Subgraph Indexing | Event indexing based on The Graph (Better Note tracking) |
| P2 | Addtl. Features (F2-F7) | Develop unimplemented features based on design docs |
| P2 | Mobile Support | WalletConnect integration + mobile responsive UI |
| P3 | Server-side Proof Gen | Server-side prover for mobile/low-end devices |

---

### TON Staking Integration — Gameplay Qualification based on LotteryCandidate

> **Ref Repo:** https://github.com/tokamak-network/ton-staking-v2/tree/lotteryCandidate

#### Purpose

Apply the LotteryCandidate mechanism from TON Staking V3 to this project to add access control, **allowing only users who have staked TON to participate in games (e.g., F9 Card Draw Game)**.

#### Background: ton-staking-v2 (lotteryCandidate branch)

| Item | Description |
|---|---|
| Project | Tokamak Network V3 Staking System (Based on Economics Whitepaper V2, Dec 2025) |
| Core Structure | Stake TON on L1 Ethereum → Distribute sequencer rewards on L2 (Titan/Thanos) |
| Staking Method | Stake TON/WTON via `DepositManagerV1_2` → Receive Coinage tokens |
| Participation Qual. | Staking ratio condition: `S_i >= θ * B_i` (Staked amount >= Threshold ratio * Bridged TON) |
| Reward Function | Hyperbolic saturation function: `y(x) = L * (x / (k + x))` |
| Key Contracts | `SeigManagerV1_4`, `DepositManagerV1_2`, `Layer2ManagerV1_2`, `RAT`, `ValidatorRewardV1` |

#### Implementation Direction

```
┌─────────────────────────────────────────────────────────┐
│                  Current Structure (Before)                 │
│                                                          │
│  User → Connect MetaMask → Immediate game participation   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Target Structure (After)                  │
│                                                          │
│  User → Connect MetaMask                                    │
│       → Check TON Staking status (on-chain query)           │
│       → Verify minimum staking condition met                 │
│       → Allow game participation only if condition met       │
└─────────────────────────────────────────────────────────┘
```

#### Implementation Tasks

| # | Task | Description |
|---|---|---|
| 1 | **Create Staking Verifier** | Develop interface/adapter contract to query user's staking balance via `DepositManagerV1_2` or Coinage contracts |
| 2 | **Add Game Access Control** | Add `require(stakingBalance >= minStake)` to `CardDrawGame.joinGame()`. Min stake should be configurable |
| 3 | **Show Staking Status in FE** | Display user's TON staking status on game screens and provide UI for staking guidance if unmet |
| 4 | **Cross-chain Consideration**| If project is on L2, design bridge/oracle mechanism to verify L1 staking status on L2 |
| 5 | **Testing** | Unit tests with Mock staking contracts + Integration tests in ton-staking-v2 fork environment |

#### Impact Scope

| File/Area | Change Description |
|---|---|
| `contracts/CardDrawGame.sol` | Add staking verification logic to `joinGame()` |
| `contracts/` (New) | Staking verification interface/adapter contract |
| `frontend/src/pages/CardDrawGamePage.tsx` | Staking status query + guidance UI for unmet conditions |
| `frontend/src/lib/contracts.ts` | Add staking contract ABI/address |
| `scripts/deploy.js` | Add staking verifier contract deployment |
| `test/` | Add tests for staking condition verification |

#### Items to Verify

| Item | Question |
|---|---|
| Target Scope | Apply only to F9(CardDrawGame), or also to F4/F5, etc.? |
| Min Staking Amount | Minimum TON staking quantity required for game participation |
| Deployment Network | Deploy on same L1, or L2 (requiring cross-chain verification)? |
| Specific Lottery Logic | Utilize lottery selection mechanism from lotteryCandidate branch for game matching? |

---

## Part B: Onboarding Checklist (7 Days)

### Day 1~2: Setup + Concept Grasp

- [ ] Install environment based on [07-Deployment & Ops](./07-deployment-ops.md)
- [ ] Run locally: `npx hardhat node` → `deploy:local` → `frontend dev`
- [ ] Connect MetaMask and click through all frontend features
- [ ] Read [01-Project Overview](./01-project-overview.md) thoroughly
- [ ] Learn basic ZK-SNARK concepts:
  - Groth16 proof system
  - Poseidon hash function
  - BabyJubJub elliptic curve
  - UTXO Note system (Nullifier, Commitment)
- [ ] Read project `README.md` thoroughly

### Day 3~4: Code Structure Understanding

- [ ] Read [02-Architecture](./02-architecture.md) + [03-Directory Structure](./03-directory-structure.md)
- [ ] Read `contracts/NFTNoteBase.sol` — **Base for all contracts**
- [ ] Follow F1 full flow:
  - Read `contracts/PrivateNFT.sol`
  - Read `circuits/main/private_nft_transfer.circom`
  - Read `test/PrivateNFT.test.js`
  - Read `frontend/src/pages/F1PrivateNFTPage.tsx`
- [ ] Run test directly: `npx hardhat test test/PrivateNFT.test.js`
- [ ] Read [04-Business Logic](./04-business-logic.md) thoroughly

### Day 5~6: Advanced Understanding

- [ ] Grasp circuit + contract flow for F4, F5, F8
- [ ] Understand F9 (`CardDrawGame.sol`) Commit-Reveal mechanism
- [ ] Read [05-Data Structures](./05-data-structures.md) thoroughly
- [ ] Run integration tests (including real ZK proofs):
  ```bash
  npx hardhat test test/PrivateNFT.integration.test.js --timeout 300000
  ```
- [ ] Read [08-Security Considerations](./08-security.md) thoroughly
- [ ] Read [09-Known Issues](./09-known-issues.md) thoroughly

### Day 7: Ready for Hands-on

- [ ] Choose 1 Known Issue, verify it, and attempt to fix
- [ ] Practice code modification → test execution cycle
- [ ] Bookmark [06-API Reference](./06-api-reference.md) for future use
- [ ] Check detailed docs in existing `docs/` folder:
  - `docs/circuits.md` — Detailed circuit design
  - `docs/contracts.md` — Detailed contract design
  - `docs/testing.md` — Testing guide

---

## Part C: Core Code Reading Guide

### "Read This File First" Order

| Order | File | Reason |
|---|---|---|
| 1 | `contracts/NFTNoteBase.sol` | Base for all contracts. Note/Nullifier concepts essential |
| 2 | `contracts/PrivateNFT.sol` | Simplest feature. Shows ZK proof verification pattern |
| 3 | `circuits/main/private_nft_transfer.circom` | Simplest circuit. Poseidon hash + ownership proof patterns |
| 4 | `frontend/src/hooks/useWallet.tsx` | Wallet connection structure (Context API) |
| 5 | `frontend/src/lib/contracts.ts` | Contract instance creation |
| 6 | `frontend/src/lib/noteStore.ts` | Off-chain Note management |
| 7 | `contracts/CardDrawGame.sol` | Most complex contract. For understanding Commit-Reveal |

### "3-File Set" by Feature

To understand each feature, read these 3 files in order:

| Feature | 1. Circuit | 2. Contract | 3. Frontend |
|---|---|---|---|
| F1 | `circuits/main/private_nft_transfer.circom` | `contracts/PrivateNFT.sol` | `frontend/src/pages/F1PrivateNFTPage.tsx` |
| F4 | `circuits/main/loot_box_open.circom` | `contracts/LootBoxOpen.sol` | `frontend/src/pages/F4LootBoxPage.tsx` |
| F5 | `circuits/main/gaming_item_trade.circom` | `contracts/GamingItemTrade.sol` | `frontend/src/pages/F5GamingItemTradePage.tsx` |
| F8 | `circuits/main/card_draw.circom` | `contracts/CardDraw.sol` | `frontend/src/pages/F8CardDrawPage.tsx` |
| F9 | (Reuse F8 circuit) | `contracts/CardDrawGame.sol` | `frontend/src/pages/CardDrawGamePage.tsx` |
