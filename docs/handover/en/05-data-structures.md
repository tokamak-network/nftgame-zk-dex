# 5. Data Structures

[< Back to Table of Contents](./README.md)

---

## 5.1 On-chain Data (Smart Contract State)

### NFTNoteBase (Common Base)

| Variable | Type | Description |
|---|---|---|
| `notes` | `mapping(bytes32 => NoteState)` | Note State (0=Invalid, 1=Valid, 2=Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | Used Nullifiers |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | Encrypted Note data |

### PrivateNFT (F1)

| Variable | Type | Description |
|---|---|---|
| `transferVerifier` | `INFTTransferVerifier` | ZK Verifier contract address |
| `registeredNFTs` | `mapping(address => mapping(uint256 => bool))` | collection → nftId → registration status |

### LootBoxOpen (F4)

| Variable | Type | Description |
|---|---|---|
| `boxVerifier` | `ILootBoxVerifier` | ZK Verifier contract |
| `paymentToken` | `IERC20` | Payment token (TON) |
| `admin` | `address` | Administrator address |
| `boxPrice` | `uint256` | Box price (Default 10 TON) |
| `nextBoxId` | `uint256` | Next Box ID (auto-increment) |
| `registeredBoxes` | `mapping(uint256 => bool)` | boxId → registration status |
| `boxOwner` | `mapping(uint256 => address)` | boxId → owner |
| `boxTypes` | `mapping(uint256 => uint256)` | boxId → box type |
| `userBoxIds` | `mapping(address => uint256[])` | List of boxes per user |

### GamingItemTrade (F5)

| Variable | Type | Description |
|---|---|---|
| `tradeVerifier` | `IGamingItemTradeVerifier` | ZK Verifier contract |
| `paymentToken` | `IERC20` | Payment token |
| `nextListingId` | `uint256` | Next Listing ID |
| `listings` | `mapping(uint256 => Listing)` | Listing details |
| `registeredItems` | `mapping(uint256 => mapping(uint256 => bool))` | gameId → itemId → registration status |

```solidity
struct Listing {
    address seller;       // Seller address
    bytes32 itemNoteHash; // Item Note Hash
    uint256 gameId;       // Game ecosystem ID
    uint256 itemId;       // Item ID
    uint256 price;        // Sale price (wei)
    bool active;          // Is active
    address buyer;        // Buyer address
    uint256 buyerPkX;     // Buyer BabyJubJub PK X
    uint256 buyerPkY;     // Buyer BabyJubJub PK Y
}
```

### CardDrawGame (F9)

```solidity
struct Game {
    address creator;           // Game creator
    GameStatus status;         // Open / PendingReveal / Revealing / Finished / Cancelled
    uint256 commitTimeout;     // Commit timeout (seconds)
    uint256 lastJoinTime;      // Last join time
    uint256 playerCount;       // Player count (Max 5)
    uint256 revealedCount;     // Number of reveals completed
    uint256 prizePool;         // Prize pool (wei)
    uint256 revealBlock;       // Target block number for seed
    uint256 prevRandaoSnapshot;// block.prevrandao snapshot
    uint256 revealSeed;        // keccak256(blockhash, prevrandao)
    uint256 revealDeadline;    // Reveal deadline (timestamp)
    address winner;            // Winner address
    uint256 highestCardValue;  // Highest card value
    uint256 createdAt;         // Creation time
}

struct Player {
    address addr;              // Player address
    bytes32 deckCommitment;    // Deck commitment
    bytes32 playerCommitment;  // Player commitment
    uint256 drawnCard;         // Drawn card (0-51)
    bool hasCommitted;         // Commitment completed
    bool hasRevealed;          // Reveal completed
}

enum GameStatus { Open, PendingReveal, Revealing, Finished, Cancelled }
```

---

## 5.2 Note Hash Structure (ZK Circuit Public Inputs)

| Feature | Note Type | Hash Calculation | Inputs |
|---|---|---|---|
| F1 | NFT Note | `Poseidon(pkX, pkY, nftId, collectionAddress, salt)` | 5 |
| F4 | Box Note | `Poseidon(pkX, pkY, boxId, boxType, boxSalt)` | 5 |
| F4 | Outcome Note | `Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)` | 5 |
| F5 | Item Note | `Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)` | 7 |
| F5 | Payment Note | `Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)` | 5 |
| F8 | Deck Commit | `DeckCommitment(deckCards[52], deckSalt)` (Recursive Chain) | 52+1 |
| F8 | Draw Commit | `Poseidon(drawnCard, drawIndex, gameId, handSalt)` | 4 |
| F8 | Player Commit | `Poseidon(pkX, pkY, gameId)` | 3 |

### Nullifier Calculation (Common)

```
nullifier = Poseidon(itemId, salt, secretKey)
```

- `itemId`: Asset unique identifier (nftId, boxId, itemId, etc.)
- `salt`: Random salt (determined during Note creation)
- `secretKey`: Owner's BabyJubJub secret key

---

## 5.3 Off-chain State Management (localStorage)

### Storage Keys

| Key | Format | Description |
|---|---|---|
| `neon-arena-notes-{address}` | `StoredNote[]` JSON | List of UTXO Notes per wallet address |
| `f9-setup-{gameId}-{address}` | JSON | Setup data for F9 card game |
| `f5_seller_setups_v1` | JSON | Cache for F5 seller setups |

### StoredNote Interface

```typescript
interface StoredNote {
  id: string;                          // crypto.randomUUID()
  hash: string;                        // bytes32 Note hash
  contractName: ContractName;          // Contract name (PrivateNFT, LootBoxOpen, etc.)
  type: "nft" | "lootbox" | "item" | "card";
  label: string;                       // Label for user identification
  metadata: Record<string, string>;    // Additional metadata
  createdAt: number;                   // Date.now()
}
```

### Note Store Behavior

- **Separate by address**: `setNoteStoreAddress(address)` → Independent storage for each wallet
- **Legacy migration**: Automatic transfer from shared key (`neon-arena-notes`) to per-address keys
- **Features**: List, Add, Remove, Clear All, JSON export/import
- **No duplication**: Skips same hash during import

---

## 5.4 Caching Strategy

| Target | Method | Remarks |
|---|---|---|
| Note Data | localStorage | Separated by address, support for import/export |
| Contract Instances | React useMemo | Reuses same signer if possible |
| ABI/Addresses | Static JSON import | Build-time binding of `deployedAddresses.json` |
| ZK Proof Files | Vite public directory | Utilizes browser cache for `.wasm`, `.zkey` |
| Server Cache | **None** | Serverless structure |

---

## 5.5 Deployment Addresses (Based on localhost)

> These change upon every execution of `npx hardhat node` + `deploy:local`.

| Contract | Address |
|---|---|
| MockERC20 (TON) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| PrivateNFT | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |
| LootBoxOpen | `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853` |
| GamingItemTrade | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |
| CardDraw | `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e` |
| CardDrawGame | `0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82` |
