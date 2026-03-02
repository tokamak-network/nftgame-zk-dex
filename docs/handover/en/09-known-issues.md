# 9. Known Issues / Tech Debt

[< Back to Table of Contents](./README.md)

---

## 9.1 Critical (Must be solved before production)

| # | Issue | Location | Description |
|---|---|---|---|
| 1 | **Phase 2 Trusted Setup is for dev** | `scripts/compile-circuit.js` | Single entropy contribution → Proof forgery possible. Multi-party ceremony essential |
| 2 | **Potential missing access control** | `LootBoxOpen.sol` | Need to verify admin check in `setBoxPrice()`, `withdrawTokens()` |
| 3 | **No external audit** | Entire contracts + circuits | Professional audit for ZK circuits + smart contracts required |
| 4 | **ERC20 safeTransfer not used** | `LootBoxOpen.sol`, `GamingItemTrade.sol`, `CardDrawGame.sol` | Silent failure possible in non-standard tokens |

---

## 9.2 High (Operational Risks)

| # | Issue | Location | Description |
|---|---|---|---|
| 5 | **Missing .env config** | Entire project | Networks, API keys, secret settings are all hardcoded. Need environment separation |
| 6 | **No CI/CD configuration** | Entire project | No automated test/deploy pipelines |
| 7 | **Contracts not upgradable** | All contracts | Proxy pattern not used. Redeployment + migration needed if bugs found |
| 8 | **Note data stored in plaintext** | `frontend/src/lib/noteStore.ts` | Note hashes exposed if XSS attack occurs |
| 9 | **blockhash expiry not handled** | `CardDrawGame.sol` | Game deadlocks if `finalizeReveal` not called within 256 blocks. No recovery mechanism |

---

## 9.3 Medium (Technical Debt)

| # | Issue | Location | Description |
|---|---|---|---|
| 10 | **Hardcoded deploy addresses** | `frontend/src/config/deployedAddresses.json` | No structure for per-network address management |
| 11 | **Not deployed to testnet/mainnet** | `hardhat.config.js` | Only localhost and ganache configured |
| 12 | **No Docker support** | Entire project | No containerization. Low environment reproducibility |
| 13 | **No unrevealed player slashing** | `CardDrawGame.sol` | Fees forfeited, but no additional penalty. Strategic non-reveal possible |
| 14 | **Circuit compilation time** | `card_draw.circom` | ~99K constraints. Compiles in 5-10 mins, proof gen takes tens of seconds |
| 15 | **Frontend error handling** | Entire frontend | Need to check user guidance level for ZK proof failures |

---

## 9.4 Low (Improvements)

| # | Issue | Location | Description |
|---|---|---|---|
| 16 | **Admin cannot be changed** | All admin-setting contracts | Fixed to msg.sender on deploy. No transfer function |
| 17 | **Event indexing optimization** | Various contracts | Lack of index parameters in some events |
| 18 | **Gas optimization** | Entire contracts | Groth16 verification gas cost is high (~200K+ gas) |

---

## 9.5 "Check Required" List

Items identified during project analysis that require precise verification:

| Item | What to verify | How to verify |
|---|---|---|
| LootBoxOpen Access | Presence of `require(msg.sender == admin)` in `setBoxPrice()`, `withdrawTokens()` | Check `contracts/LootBoxOpen.sol` source |
| F4 Test Count | README lists 39, analysis found 48 | Run tests directly and count |
| Frontend Error Handl. | User guidance level for ZK/TX failures | Check frontend code and actual tests |
| Production Target | Testnet/Mainnet plans | Ask project manager |
