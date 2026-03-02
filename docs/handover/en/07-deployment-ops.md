# 7. Deployment & Ops

[< Back to Table of Contents](./README.md)

---

## 7.1 Prerequisites

| Tool | Installation | Verification |
|---|---|---|
| Node.js v20 | `nvm install 20` | `node -v` |
| npm | Included with Node.js | `npm -v` |
| Circom 2.1.0 | [docs.circom.io](https://docs.circom.io/getting-started/installation/) | `circom --version` |
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | `forge --version` |
| MetaMask | Chrome Web Store | Check browser extension |

---

## 7.2 Installation Steps

```bash
# 1. Clone repository (including submodules)
git clone --recurse-submodules <repo-url>
cd nftGame-zk-dex

# 2. Set Node.js version
nvm use

# 3. Install root dependencies
npm install

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Download Powers of Tau file (~4.5GB, once only)
mkdir -p circuits/ptau
wget -O circuits/ptau/powersOfTau28_hez_final_22.ptau \
  https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau

# 6. Compile ZK circuits (Each takes mins~tens of mins)
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js loot_box_open
node scripts/compile-circuit.js gaming_item_trade
node scripts/compile-circuit.js card_draw    # Takes longest (~5-10 mins)

# 7. Compile smart contracts
npx hardhat compile
```

---

## 7.3 Local Execution

```bash
# Terminal 1: Run local blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost
# → frontend/src/config/deployedAddresses.json auto-generated

# Terminal 3: Run frontend
cd frontend && npm run dev
# → http://localhost:3000
```

### MetaMask Network Settings

| Item | Value |
|---|---|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `1337` |
| Currency Symbol | ETH |

> Import the Private Keys from the test accounts output by `npx hardhat node` into MetaMask.

---

## 7.4 Running Tests

```bash
# Overall Hardhat tests (Unit + Integration)
npx hardhat test

# ZK circuit tests only (Mocha)
npx mocha test/circuits/ --timeout 120000

# Foundry tests (Including Fuzz 256 runs)
forge test

# Integration tests only (Using real ZK proofs, slow)
npx hardhat test test/*.integration.test.js --timeout 300000
```

### Test Status (170/170 Passing)

| Feature | Circuit (Mocha) | Unit (Hardhat) | Unit (Foundry) | Integration (Real ZK) | Total |
|---|---|---|---|---|---|
| F1 | 11 | 4 | 14 | 9 | 38 |
| F4 | 15 | 9 | 15 | 9 | 48 |
| F5 | 12 | 9 | 17 | 9 | 47 |
| F8 | 14 | 9 | 15 | 8 | 46 |
| **Total** | **52** | **31** | **61** | **35** | **~170** |

---

## 7.5 Environment Variables

> Currently no `.env` file **exists**, and all settings are hardcoded.

### Hardcoded Configuration Values

| Value | Location | Description |
|---|---|---|
| `chainId: 1337` | `hardhat.config.js` | Local Chain ID |
| `BOX_PRICE: 10 TON` | `scripts/deploy.js` | Lootbox price |
| `ENTRY_FEE: 10 TON` | `scripts/deploy.js` | Card game entry fee |
| `DEFAULT_TIMEOUT: 60s` | `scripts/deploy.js` | Default game timeout |
| Contract Address | `frontend/src/config/deployedAddresses.json` | Auto-generated on deploy |
| `FEE_PERCENT: 10` | `CardDrawGame.sol` | 10% game fee |
| `MAX_PLAYERS: 5` | `CardDrawGame.sol` | Max players per game |
| `REVEAL_TIMEOUT: 120` | `CardDrawGame.sol` | Reveal time limit (seconds) |

---

## 7.6 Deployment Script Behavior

When `scripts/deploy.js` runs:

1. **MockERC20 (TON)** deployment → Mint 10,000 TON each to deployer + 2 test accounts
2. Sequential deployment per feature:
   - Deploy Verifier contract
   - Deploy Main contract (inject Verifier address)
3. Record all addresses in `frontend/src/config/deployedAddresses.json`

| Order | Verifier | Main Contract | Additional Arguments |
|---|---|---|---|
| 1 | PrivateNftTransferVerifier | PrivateNFT | - |
| 2 | LootBoxOpenVerifier | LootBoxOpen | tokenAddr, BOX_PRICE |
| 3 | GamingItemTradeVerifier | GamingItemTrade | tokenAddr |
| 4 | CardDrawVerifier | CardDraw | - |
| 5 | CardDrawVerifier (Reused) | CardDrawGame | tokenAddr, ENTRY_FEE, TIMEOUT |

---

## 7.7 CI/CD

| Item | Current Status |
|---|---|
| CI/CD Pipeline | **Unconfigured** |
| GitHub Actions | No config files |
| Auto-testing | Manual run only |
| Auto-deploy | Manual run only |

> **Need verification:** Production deployment target network and CI/CD setup plan

---

## 7.8 Frontend Build

```bash
cd frontend && npm run build
# → Static files generated in frontend/dist/

cd frontend && npm run preview
# → Preview production build
```
