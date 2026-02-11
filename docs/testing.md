# Testing Guide

## Overview

The project has four levels of testing:

| Level | Tool | Blockchain | ZK Proof | Speed |
|-------|------|------------|----------|-------|
| **Circuit Unit** | Mocha + snarkjs | No | Real | Medium (~2s per test) |
| **Contract Unit (Hardhat)** | Hardhat + Chai | Hardhat EVM | Mock (always true) | Fast (~50ms per test) |
| **Contract Unit (Foundry)** | Forge + forge-std | Forge EVM | Mock (always true) | Very Fast (~1ms per test) |
| **Integration** | Hardhat + snarkjs | Hardhat EVM | Real | Slow (~200ms per test) |

---

## Prerequisites

Before running tests, ensure:

1. **Dependencies installed**: `npm install`
2. **Git submodules initialized** (for Foundry tests):
   ```bash
   git submodule update --init --recursive
   ```
3. **Circuits compiled** (for circuit unit and integration tests):
   ```bash
   node scripts/compile-circuit.js private_nft_transfer
   node scripts/compile-circuit.js gaming_item_trade
   ```
4. **Contracts compiled**: `npx hardhat compile`

> Contract unit tests (Hardhat mock and Foundry) can run without circuit compilation. Circuit unit and integration tests require compiled circuit artifacts.

---

## Running Tests

### All Tests at Once

```bash
# All Hardhat tests (contract unit + integration)
npx hardhat test

# All circuit unit tests
npx mocha test/circuits/ --timeout 120000

# All Foundry tests
forge test

# Everything
npx hardhat test && npx mocha test/circuits/ --timeout 120000 && forge test
```

### By Feature

#### F1: Private NFT Transfer

```bash
# Circuit unit tests (11 tests)
npx mocha test/circuits/nft-transfer.test.js --timeout 120000

# Contract unit tests - Hardhat mock verifier (4 tests)
npx hardhat test test/PrivateNFT.test.js

# Contract unit tests - Foundry (14 tests including fuzz)
forge test --match-contract PrivateNFTTest

# Integration tests - real ZK proofs (9 tests)
npx hardhat test test/PrivateNFT.integration.test.js
```

#### F5: Gaming Item Trade

```bash
# Circuit unit tests (12 tests)
npx mocha test/circuits/gaming-item-trade.test.js --timeout 120000

# Contract unit tests - Hardhat mock verifier (9 tests)
npx hardhat test test/GamingItemTrade.test.js

# Contract unit tests - Foundry (17 tests including fuzz)
forge test --match-contract GamingItemTradeTest

# Integration tests - real ZK proofs (9 tests)
npx hardhat test test/GamingItemTrade.integration.test.js
```

---

## Test Breakdown

### F1: Private NFT Transfer (24 Hardhat/Mocha + 14 Foundry)

#### Circuit Unit Tests (`test/circuits/nft-transfer.test.js`)

| Test | Category | What it verifies |
|------|----------|-----------------|
| Valid proof generation & verification | Happy path | Complete proof lifecycle |
| Correct public signals order | Happy path | Signal ordering matches circuit declaration |
| Different proofs for different transfers | Happy path | Proof uniqueness |
| Wrong secret key | Security | Ownership validation |
| Wrong nftId | Security | NFT identity preservation |
| Wrong salt | Security | Note commitment integrity |
| Wrong nullifier | Security | Nullifier computation |
| Wrong old note hash | Security | Commitment verification |
| Wrong new note hash | Security | New note integrity |
| Swapped owner keys | Security | Key binding |
| Tampered public signals | Security | Proof-signal binding |

#### Contract Unit Tests (`test/PrivateNFT.test.js`)

| Test | What it verifies |
|------|-----------------|
| Register a new NFT note | Basic note creation |
| Reject duplicate NFT registration | Registration uniqueness |
| Transfer NFT with valid proof (mock) | Transfer flow with mock verifier |
| Reject transfer with used nullifier | Double-spend prevention |

#### Foundry Tests (`test/foundry/PrivateNFT.t.sol`)

| Test | Category | What it verifies |
|------|----------|-----------------|
| test_RegisterNFT | Happy path | Basic note creation and state |
| test_RegisterNFT_EmitsEvent | Events | NFTRegistered event with correct args |
| test_RegisterNFT_EmitsNoteCreated | Events | NoteCreated event from base contract |
| test_RevertWhen_DuplicateNFTRegistration | Security | Same collection/nftId rejected |
| test_RevertWhen_DuplicateNoteHash | Security | Same noteHash rejected |
| testFuzz_RegisterNFT | Fuzz (256 runs) | Random noteHash/nftId registration |
| test_TransferNFT | Happy path | Full transfer flow with state changes |
| test_TransferNFT_EmitsEvents | Events | NoteSpent + NoteCreated + NFTTransferred |
| test_ChainedTransfer | Happy path | A -> B -> C multi-hop transfer |
| test_RevertWhen_DoubleSpend | Security | Same nullifier reuse blocked |
| test_RevertWhen_SpentNote | Security | Already-spent note rejected |
| test_RevertWhen_NonExistentNote | Security | Non-existent note rejected |
| test_GetNoteState_Invalid | View | Default state is Invalid (0) |
| test_IsNullifierUsed_False | View | Default nullifier is unused |

#### Integration Tests (`test/PrivateNFT.integration.test.js`)

| Test | What it verifies |
|------|-----------------|
| Register and transfer with real ZK proof | Full pipeline end-to-end |
| Chained transfers (A -> B -> C) | Multi-hop ownership transfer |
| Reject double-spend (same nullifier) | On-chain nullifier tracking |
| Reject transfer of already-spent note | Note state management |
| Reject transfer of non-existent note | Note existence check |
| Reject duplicate NFT registration | Registration uniqueness |
| Reject duplicate note hash | Note hash uniqueness |
| Emit NFTRegistered event | Event emission |
| Emit NFTTransferred event | Event emission |

---

### F5: Gaming Item Trade (30 Hardhat/Mocha + 17 Foundry)

#### Circuit Unit Tests (`test/circuits/gaming-item-trade.test.js`)

| Test | Category | What it verifies |
|------|----------|-----------------|
| Valid paid trade proof | Happy path | Paid trade (price > 0) complete lifecycle |
| Valid gift (price=0) proof | Happy path | Free transfer with paymentNoteHash = 0 |
| Correct public signals order | Happy path | 5 signals: oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier |
| Wrong secret key | Security | Ownership validation |
| Wrong itemId | Security | Item identity preservation |
| Wrong gameId | Security | Game ecosystem isolation |
| Wrong nullifier | Security | Nullifier computation |
| Tampered itemAttributes | Security | Attribute preservation |
| Wrong payment hash (wrong price) | Security | Payment integrity |
| Gift with non-zero paymentNoteHash | Security | Gift/paid mode correctness |
| Tampered public signals (gameId) | Security | Proof-signal binding |
| Tampered public signals (nullifier) | Security | Proof-signal binding |

#### Contract Unit Tests (`test/GamingItemTrade.test.js`)

| Test | What it verifies |
|------|-----------------|
| Register a new item note | Basic note creation with gameId/itemId |
| Reject duplicate item registration | Registration uniqueness per game |
| Allow same itemId in different games | Game ecosystem isolation |
| Emit ItemRegistered event | Event emission with correct args |
| Trade item with valid proof (mock) | Transfer flow with mock verifier |
| Trade item as gift (paymentNoteHash = 0) | Gift mode support |
| Reject transfer with used nullifier | Double-spend prevention |
| Reject trade of non-existent note | Note existence check |
| Emit ItemTraded event | Event emission with correct args |

#### Foundry Tests (`test/foundry/GamingItemTrade.t.sol`)

| Test | Category | What it verifies |
|------|----------|-----------------|
| test_RegisterItem | Happy path | Basic item note creation |
| test_RegisterItem_EmitsEvent | Events | ItemRegistered event with correct args |
| test_RegisterItem_EmitsNoteCreated | Events | NoteCreated event from base contract |
| test_RevertWhen_DuplicateItemRegistration | Security | Same gameId/itemId rejected |
| test_RevertWhen_DuplicateNoteHash | Security | Same noteHash rejected |
| test_SameItemIdDifferentGames | Isolation | Same itemId in different games allowed |
| testFuzz_RegisterItem | Fuzz (256 runs) | Random noteHash/gameId/itemId registration |
| test_TradeItem_Paid | Happy path | Paid trade with mock verifier |
| test_TradeItem_Gift | Happy path | Gift trade (paymentHash = 0) |
| test_TradeItem_EmitsEvents | Events | NoteSpent + NoteCreated + ItemTraded |
| test_ChainedTrade | Happy path | A -> B -> C multi-hop trade |
| test_RevertWhen_DoubleSpend | Security | Same nullifier reuse blocked |
| test_RevertWhen_SpentNote | Security | Already-spent note rejected |
| test_RevertWhen_NonExistentNote | Security | Non-existent note rejected |
| test_GetNoteState_Invalid | View | Default state is Invalid (0) |
| test_IsNullifierUsed_False | View | Default nullifier is unused |
| testFuzz_TradeItem | Fuzz (256 runs) | Random hashes/nullifier full trade flow |

#### Integration Tests (`test/GamingItemTrade.integration.test.js`)

| Test | What it verifies |
|------|-----------------|
| Register and trade with real ZK proof (paid) | Full pipeline for paid trade |
| Register and trade as gift (price=0) | Full pipeline for gift |
| Chained trades (A -> B -> C) | Multi-hop item transfer |
| Reject double-spend (same nullifier) | On-chain nullifier tracking |
| Reject trade of already-spent note | Note state management |
| Reject duplicate item registration | Registration uniqueness |
| Reject duplicate note hash | Note hash uniqueness |
| Emit ItemRegistered event | Event emission |
| Emit ItemTraded event | Event emission |

---

## Foundry Tests

### Overview

Foundry (Forge) tests provide fast, Solidity-native contract testing with built-in fuzz testing support. They complement the Hardhat tests by offering:

- **Speed**: ~100ms total vs seconds for Hardhat
- **Fuzz testing**: Automatically generates random inputs (256 runs per fuzz test)
- **Native Solidity**: Tests written in Solidity, closer to the contract language
- **Gas reporting**: Built-in gas measurement per test

### Configuration

| File | Purpose |
|------|---------|
| `foundry.toml` | Forge config (src, test dir, solc version, fuzz runs) |
| `remappings.txt` | Import path mappings (`forge-std/`) |
| `.gitmodules` | forge-std submodule reference |

### Running Foundry Tests

```bash
# All Foundry tests
forge test

# With verbosity (show test names)
forge test -vv

# With gas report
forge test --gas-report

# Specific contract
forge test --match-contract PrivateNFTTest
forge test --match-contract GamingItemTradeTest

# Specific test
forge test --match-test test_TradeItem_Gift

# Increase fuzz runs
forge test --fuzz-runs 1024
```

### Fuzz Test Details

Fuzz tests use `vm.assume()` to filter invalid inputs and run 256 iterations by default:

| Test | Contract | Fuzz Parameters | What it validates |
|------|----------|-----------------|-------------------|
| `testFuzz_RegisterNFT` | PrivateNFT | noteHash, nftId | Registration works for any valid inputs |
| `testFuzz_RegisterItem` | GamingItemTrade | noteHash, gameId, itemId | Registration works for any valid inputs |
| `testFuzz_TradeItem` | GamingItemTrade | oldHash, newHash, paymentHash, nullifier, itemId | Full trade flow with random values |

---

## Troubleshooting

### "zkey not found" — Circuit tests skip

The circuit unit tests and integration tests require compiled circuit artifacts. If you see:

```
⚠️  Skipping circuit tests: zkey not found
```

Run the circuit compilation:
```bash
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js gaming_item_trade
```

### "HH701: Artifact not found" — Verifier contract not compiled

If integration tests fail with artifact errors, the Solidity verifier hasn't been compiled:
```bash
npx hardhat compile
```

### Timeout errors on circuit tests

Circuit proof generation can be slow. Increase the timeout:
```bash
npx mocha test/circuits/ --timeout 300000
```

### Two Groth16Verifier contracts

Both F1 and F5 generate a Solidity verifier named `Groth16Verifier`. Hardhat handles this with fully qualified names. In code:
```javascript
// Use fully qualified path to avoid ambiguity
const Verifier = await ethers.getContractFactory(
  "contracts/verifiers/GamingItemTradeVerifier.sol:Groth16Verifier"
);
```

### Foundry: "forge-std not found"

If Forge cannot find `forge-std`, initialize the git submodule:
```bash
git submodule update --init --recursive
```

### Foundry: cache error on first build

If you see `invalid type: sequence, expected a map` on first `forge build`, this is a harmless cache warning. The compilation still succeeds.
