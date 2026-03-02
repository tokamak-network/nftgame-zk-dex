# 6. API Reference

[< Back to Table of Contents](./README.md)

---

> This project has no REST API. All interactions are made through **smart contract function calls**.

---

## 6.1 PrivateNFT (F1)

| Function | Type | Parameters | Description |
|---|---|---|---|
| `registerNFT` | write | `noteHash, collection, nftId, encryptedNote` | Register NFT into privacy system |
| `transferNFT` | write | `a[2], b[2][2], c[2], oldNftHash, newNftHash, nftId, collectionAddress, nullifier, encryptedNote` | Transfer NFT using ZK proof |
| `getNoteState` | view | `noteHash` | Query Note state (0=Invalid, 1=Valid, 2=Spent) |
| `isNullifierUsed` | view | `nullifier` | Check if Nullifier is used |

**ZK Public Inputs (5):** `oldNftHash, newNftHash, nftId, collectionAddress, nullifier`

---

## 6.2 LootBoxOpen (F4)

| Function | Type | Parameters | Description |
|---|---|---|---|
| `mintBox` | write | `boxType` | Issue box after ERC20 payment |
| `registerBox` | write | `noteHash, boxId, encryptedNote` | Register box Note (Owner only) |
| `openBox` | write | `a[2], b[2][2], c[2], boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier, encryptedNote` | Open box using ZK proof |
| `getMyBoxes` | view | `user (address)` | List of box IDs for user |
| `getBoxInfo` | view | `boxId` | Box info (owner, type, registration status) |
| `setBoxPrice` | write | `price` | Update price (admin) |
| `withdrawTokens` | write | `to (address)` | Withdraw tokens (admin) |

**ZK Public Inputs (5):** `boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier`

---

## 6.3 GamingItemTrade (F5)

| Function | Type | Parameters | Description |
|---|---|---|---|
| `registerItem` | write | `noteHash, gameId, itemId, encryptedNote` | Register item |
| `listItem` | write | `itemNoteHash, gameId, itemId, price` | Register for sale |
| `purchaseItem` | write | `listingId, buyerPkX, buyerPkY` | Escrow payment + PK submission |
| `executeTradeForBuyer` | write | `listingId, a[2], b[2][2], c[2], newItemHash, paymentNoteHash, nullifier, encryptedNote` | Complete trade using ZK proof |
| `cancelListing` | write | `listingId` | Cancel listing (Includes refund) |
| `getListings` | view | - | Query all listings |
| `getListing` | view | `listingId` | Query single listing |

**ZK Public Inputs (5):** `oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier`

---

## 6.4 CardDraw (F8)

| Function | Type | Parameters | Description |
|---|---|---|---|
| `registerDeck` | write | `deckCommitment, gameId, encryptedNote` | Register shuffled deck |
| `drawCard` | write | `a[2], b[2][2], c[2], deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, encryptedCardNote` | Draw card using ZK proof |

**ZK Public Inputs (5):** `deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment`

---

## 6.5 CardDrawGame (F9)

| Function | Type | Parameters | Description |
|---|---|---|---|
| `createGame` | write | `commitTimeout` | Create game room |
| `joinGame` | write | `gameId, deckCommitment, playerCommitment` | Join + Participation fee (ERC20) |
| `startReveal` | write | `gameId` | Start reveal phase (set revealBlock) |
| `finalizeReveal` | write | `gameId` | Finalize revealSeed |
| `revealCard` | write | `gameId, a[2], b[2][2], c[2], drawCommitment, drawnCard` | Reveal card using ZK proof |
| `closeGame` | write | `gameId` | End game + Decide winner |
| `cancelGame` | write | `gameId` | Cancel game (Open phase only) |
| `getPlayerDrawIndex` | view | `gameId, player` | Calculate drawIndex |
| `withdrawFees` | write | `to (address)` | Withdraw fees (admin) |

**ZK Public Inputs (5):** `deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment`

---

## 6.6 Common Events

### NFTNoteBase (Emitted by all contracts)

| Event | Parameters | Purpose |
|---|---|---|
| `NoteCreated` | `noteHash (indexed), encryptedNote` | Track Note creation |
| `NoteSpent` | `noteHash (indexed), nullifier (indexed)` | Track Note consumption |

### PrivateNFT

| Event | Parameters |
|---|---|
| `NFTRegistered` | `collection (indexed), nftId (indexed), noteHash` |
| `NFTTransferred` | `oldNoteHash (indexed), newNoteHash (indexed), nullifier` |

### LootBoxOpen

| Event | Parameters |
|---|---|
| `BoxMinted` | `buyer (indexed), boxId (indexed), boxType` |
| `BoxRegistered` | `boxId (indexed), noteHash` |
| `BoxOpened` | `boxCommitment (indexed), outcomeCommitment (indexed), nullifier, vrfOutput` |
| `PriceUpdated` | `newPrice` |

### GamingItemTrade

| Event | Parameters |
|---|---|
| `ItemRegistered` | `gameId (indexed), itemId (indexed), noteHash` |
| `ItemListed` | `seller (indexed), listingId (indexed), price` |
| `ItemPurchased` | `buyer (indexed), listingId (indexed), buyerPkX, buyerPkY` |
| `ItemTradeCompleted` | `listingId (indexed), oldNote, newNote` |
| `ListingCancelled` | `listingId (indexed)` |

### CardDrawGame

| Event | Parameters |
|---|---|
| `GameCreated` | `gameId (indexed), creator (indexed), commitTimeout` |
| `PlayerCommitted` | `gameId (indexed), player (indexed), playerCount` |
| `RevealPending` | `gameId (indexed), revealBlock` |
| `RevealStarted` | `gameId (indexed), revealSeed, revealDeadline` |
| `PlayerRevealed` | `gameId (indexed), player (indexed), drawnCard, drawIndex` |
| `GameFinished` | `gameId (indexed), winner (indexed), prize, highestCard` |
| `GameCancelled` | `gameId (indexed)` |
