# Smart Contract Architecture

## Overview

All contracts are written in Solidity 0.8.20, compiled with both Hardhat and Foundry, and use the Paris EVM target.

### Contract Hierarchy

```
NFTNoteBase (base)
├── PrivateNFT (F1: Private NFT Transfer)
├── LootBoxOpen (F4: Loot Box Open)
└── GamingItemTrade (F5: Gaming Item Trade)

IGroth16Verifier.sol (interfaces)
├── INFTTransferVerifier → PrivateNftTransferVerifier.sol (generated)
│                        → MockNFTTransferVerifier.sol (test)
├── ILootBoxVerifier → LootBoxOpenVerifier.sol (generated)
│                    → MockLootBoxVerifier.sol (test)
└── IGamingItemTradeVerifier → GamingItemTradeVerifier.sol (generated)
                             → MockGamingItemTradeVerifier.sol (test)
```

---

## NFTNoteBase

**File**: `contracts/NFTNoteBase.sol`

Base contract providing UTXO-style note management and nullifier tracking, shared by F1, F4, and F5.

### State

| Variable | Type | Description |
|----------|------|-------------|
| `notes` | `mapping(bytes32 => NoteState)` | Note hash to state (Invalid/Valid/Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | Nullifier to used status |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | Note hash to ECDH-encrypted data |

### NoteState Enum

| Value | Name | Description |
|-------|------|-------------|
| 0 | Invalid | Note doesn't exist |
| 1 | Valid | Note is active |
| 2 | Spent | Note has been consumed |

### Internal Functions

| Function | Description |
|----------|-------------|
| `_createNote(noteHash, encryptedNote)` | Create a new Valid note. Reverts if note already exists. |
| `_spendNote(noteHash, nullifier)` | Mark note as Spent and record nullifier. Reverts if note not Valid or nullifier used. |

### Events

| Event | Parameters | Emitted on |
|-------|------------|------------|
| `NoteCreated` | `noteHash (indexed), encryptedNote` | Note creation |
| `NoteSpent` | `noteHash (indexed), nullifier (indexed)` | Note spending |

### Modifiers

| Modifier | Condition |
|----------|-----------|
| `noteExists(noteHash)` | `notes[noteHash] == NoteState.Valid` |
| `nullifierNotUsed(nullifier)` | `!nullifiers[nullifier]` |

---

## PrivateNFT (F1)

**File**: `contracts/PrivateNFT.sol`

Inherits `NFTNoteBase`. Manages private NFT transfers using ZK proofs.

### State

| Variable | Type | Description |
|----------|------|-------------|
| `transferVerifier` | `INFTTransferVerifier` | ZK proof verifier contract |
| `registeredNFTs` | `mapping(address => mapping(uint256 => bool))` | Collection -> NFT ID -> registered |

### Functions

#### `registerNFT(noteHash, collection, nftId, encryptedNote)`

Register an NFT into the private system.

| Parameter | Type | Description |
|-----------|------|-------------|
| `noteHash` | `bytes32` | NFT note commitment |
| `collection` | `address` | NFT collection contract address |
| `nftId` | `uint256` | NFT token ID |
| `encryptedNote` | `bytes` | ECDH-encrypted note data |

**Reverts**: "NFT already registered" if the same collection/nftId is registered twice.

#### `transferNFT(a, b, c, oldNftHash, newNftHash, nftId, collectionAddress, nullifier, encryptedNote)`

Transfer NFT privately with a ZK proof.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 proof points |
| `oldNftHash` | `bytes32` | Current note hash |
| `newNftHash` | `bytes32` | New note hash (new owner) |
| `nftId` | `uint256` | NFT token ID |
| `collectionAddress` | `address` | Collection address |
| `nullifier` | `bytes32` | Nullifier |
| `encryptedNote` | `bytes` | New encrypted note |

**Public inputs to verifier**: `[oldNftHash, newNftHash, nftId, collectionAddress, nullifier]`

**Reverts**: "Invalid transfer proof", "Note does not exist or already spent", "Nullifier already used"

### Events

| Event | Parameters |
|-------|------------|
| `NFTRegistered` | `collection (indexed), nftId (indexed), noteHash` |
| `NFTTransferred` | `oldNoteHash (indexed), newNoteHash (indexed), nullifier` |

---

## LootBoxOpen (F4)

**File**: `contracts/LootBoxOpen.sol`

Inherits `NFTNoteBase`. Manages verifiable random loot box openings using ZK proofs.

### State

| Variable | Type | Description |
|----------|------|-------------|
| `lootBoxVerifier` | `ILootBoxVerifier` | ZK proof verifier contract |
| `registeredBoxes` | `mapping(uint256 => bool)` | BoxId -> registered |

### Functions

#### `registerBox(noteHash, boxId, encryptedNote)`

Register a sealed loot box into the system.

| Parameter | Type | Description |
|-----------|------|-------------|
| `noteHash` | `bytes32` | Box note commitment |
| `boxId` | `uint256` | Box identifier |
| `encryptedNote` | `bytes` | ECDH-encrypted note data |

**Reverts**: "Box already registered" if the same boxId is registered twice.

#### `openBox(a, b, c, boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier, encryptedNote)`

Open a loot box with a ZK proof of valid VRF and rarity determination.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 proof points |
| `boxCommitment` | `bytes32` | Sealed box note hash |
| `outcomeCommitment` | `bytes32` | Outcome item note hash |
| `vrfOutput` | `uint256` | VRF output value |
| `boxId` | `uint256` | Box identifier |
| `nullifier` | `bytes32` | Nullifier |
| `encryptedNote` | `bytes` | Encrypted outcome note |

**Public inputs to verifier**: `[boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier]`

**Reverts**: "Invalid loot box proof", "Note does not exist or already spent", "Nullifier already used"

### Events

| Event | Parameters |
|-------|------------|
| `BoxRegistered` | `boxId (indexed), noteHash` |
| `BoxOpened` | `boxCommitment (indexed), outcomeCommitment (indexed), nullifier, vrfOutput` |

---

## GamingItemTrade (F5)

**File**: `contracts/GamingItemTrade.sol`

Inherits `NFTNoteBase`. Manages private game item trades with payment support.

### State

| Variable | Type | Description |
|----------|------|-------------|
| `tradeVerifier` | `IGamingItemTradeVerifier` | ZK proof verifier contract |
| `registeredItems` | `mapping(uint256 => mapping(uint256 => bool))` | GameId -> ItemId -> registered |

### Functions

#### `registerItem(noteHash, gameId, itemId, encryptedNote)`

Register a game item into the private trading system.

| Parameter | Type | Description |
|-----------|------|-------------|
| `noteHash` | `bytes32` | Item note commitment |
| `gameId` | `uint256` | Game ecosystem identifier |
| `itemId` | `uint256` | Item token ID |
| `encryptedNote` | `bytes` | ECDH-encrypted note data |

**Reverts**: "Item already registered" if same gameId/itemId is registered twice.

> The same `itemId` can be registered in different games (different `gameId`).

#### `tradeItem(a, b, c, oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier, encryptedNote)`

Trade an item privately with a ZK proof.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 proof points |
| `oldItemHash` | `bytes32` | Current item note hash |
| `newItemHash` | `bytes32` | New item note hash (new owner) |
| `paymentNoteHash` | `bytes32` | Payment note hash (0x0 for gifts) |
| `gameId` | `uint256` | Game ecosystem identifier |
| `nullifier` | `bytes32` | Nullifier |
| `encryptedNote` | `bytes` | New encrypted note |

**Public inputs to verifier**: `[oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]`

**Reverts**: "Invalid trade proof", "Note does not exist or already spent", "Nullifier already used"

### Events

| Event | Parameters |
|-------|------------|
| `ItemRegistered` | `gameId (indexed), itemId (indexed), noteHash` |
| `ItemTraded` | `oldItemHash (indexed), newItemHash (indexed), nullifier` |

---

## Verifier Interfaces

**File**: `contracts/verifiers/IGroth16Verifier.sol`

All three interfaces have the same signature (5 public inputs):

```solidity
interface INFTTransferVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}

interface ILootBoxVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}

interface IGamingItemTradeVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}
```

### Generated Verifiers

| File | Generated from | Contract name |
|------|---------------|---------------|
| `PrivateNftTransferVerifier.sol` | F1 circuit zkey | `Groth16Verifier` |
| `LootBoxOpenVerifier.sol` | F4 circuit zkey | `Groth16Verifier` |
| `GamingItemTradeVerifier.sol` | F5 circuit zkey | `Groth16Verifier` |

> All three have the contract name `Groth16Verifier` (snarkjs default). Use fully qualified names in Hardhat:
> ```javascript
> ethers.getContractFactory("contracts/verifiers/GamingItemTradeVerifier.sol:Groth16Verifier")
> ```

### Mock Verifiers

For unit testing (both Hardhat and Foundry), mock verifiers always return `true`:

| File | Implements | Used by |
|------|------------|---------|
| `test/MockNFTTransferVerifier.sol` | `INFTTransferVerifier` | Hardhat + Foundry tests |
| `test/MockLootBoxVerifier.sol` | `ILootBoxVerifier` | Hardhat + Foundry tests |
| `test/MockGamingItemTradeVerifier.sol` | `IGamingItemTradeVerifier` | Hardhat + Foundry tests |

---

## Proof Format

snarkjs outputs Groth16 proofs as `{pi_a, pi_b, pi_c}`. The Solidity verifier expects `(uint[2] a, uint[2][2] b, uint[2] c)`.

**Important**: The `b` coordinates must be reordered:

```javascript
// snarkjs output → Solidity input
a = [proof.pi_a[0], proof.pi_a[1]];
b = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],   // reversed!
  [proof.pi_b[1][1], proof.pi_b[1][0]]     // reversed!
];
c = [proof.pi_c[0], proof.pi_c[1]];
```

---

## Foundry Tests

Foundry (Forge) tests are located in `test/foundry/` and use forge-std for assertions, event checking, and fuzz testing.

### Test Files

| File | Contract | Tests | Fuzz |
|------|----------|-------|------|
| `test/foundry/PrivateNFT.t.sol` | `PrivateNFTTest` | 14 | 1 (256 runs) |
| `test/foundry/LootBoxOpen.t.sol` | `LootBoxOpenTest` | 15 | 2 (256 runs) |
| `test/foundry/GamingItemTrade.t.sol` | `GamingItemTradeTest` | 17 | 2 (256 runs) |

### Test Pattern

Each test file follows a consistent structure:

```solidity
contract PrivateNFTTest is Test {
    // 1. Deploy mock verifier + contract in setUp()
    // 2. test_*() for happy path tests
    // 3. test_RevertWhen_*() for expected revert cases
    // 4. testFuzz_*() for fuzz tests with vm.assume() guards
}
```

### Key Forge Features Used

| Feature | Usage |
|---------|-------|
| `vm.expectRevert(msg)` | Verify revert with specific error message |
| `vm.expectEmit(...)` | Verify event emission with indexed/non-indexed args |
| `vm.assume(cond)` | Filter invalid fuzz inputs |
| `assertEq`, `assertTrue` | State assertions |

### Running

```bash
# All tests with verbosity
forge test -vv

# Gas report
forge test --gas-report

# Specific contract
forge test --match-contract GamingItemTradeTest -vv
```

---

## Deployment

Constructor parameters:

| Contract | Constructor Arg | Description |
|----------|----------------|-------------|
| `PrivateNFT` | `address _transferVerifier` | Deployed `PrivateNftTransferVerifier` address |
| `LootBoxOpen` | `address _lootBoxVerifier` | Deployed `LootBoxOpenVerifier` address |
| `GamingItemTrade` | `address _tradeVerifier` | Deployed `GamingItemTradeVerifier` address |

### Deployment Order

1. Deploy `Groth16Verifier` (from `PrivateNftTransferVerifier.sol`)
2. Deploy `PrivateNFT(verifierAddress)`
3. Deploy `Groth16Verifier` (from `LootBoxOpenVerifier.sol`)
4. Deploy `LootBoxOpen(verifierAddress)`
5. Deploy `Groth16Verifier` (from `GamingItemTradeVerifier.sol`)
6. Deploy `GamingItemTrade(verifierAddress)`
