# 4. Core Business Logic

[< Back to Table of Contents](./README.md)

---

## 4.1 UTXO Note System (Heart of All Features)

All features are built on top of a **UTXO-style Note system**. Understanding this system is essential to understanding the rest of the code.

### Note Lifecycle

```
Invalid (Does not exist)
  → Valid (Created, usable)
    → Spent (Consumed, cannot be reused)
```

### Double-Spend Prevention (Nullifier)

```
Nullifier = Poseidon(itemId, salt, secretKey)
→ Once-used Nullifier is permanently recorded in on-chain mapping
→ Transaction reverts if attempts are made to use the same Note twice
```

### NFTNoteBase.sol (Base Contract)

All feature contracts inherit from this base contract.

| State Variable | Type | Description |
|---|---|---|
| `notes` | `mapping(bytes32 => NoteState)` | Note hash → State (Invalid/Valid/Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | Record of used Nullifiers |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | ECDH encrypted Note data |

| Function | Description |
|---|---|
| `_createNote(noteHash, encryptedNote)` | Create Note in Valid state |
| `_spendNote(noteHash, nullifier)` | Change Note to Spent + record Nullifier |
| `noteExists(noteHash)` modifier | Confirm Note is Valid |
| `nullifierNotUsed(nullifier)` modifier | Confirm Nullifier is unused |

---

## 4.2 F1: Private NFT Transfer

### Flow Diagram

```
                     Frontend (Browser)
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    1. registerNFT   2. Gen ZK Proof   3. transferNFT
    (NFT Registration) (snarkjs)       (Execute Transfer)
         │                │                │
         ▼                ▼                ▼
    PrivateNFT.sol   Circom Circuits   PrivateNFT.sol
    - Create Note    - Prove ownership - Spend old Note
    - Store encr.    - Calc Nullifier  - Create new Note
                     - Form new Note   - Call Verifier
```

### Detailed Flow

1. **User A registers NFT**: `registerNFT(noteHash, collection, nftId, encryptedNote)`
   - Note hash = `Poseidon(A.pkX, A.pkY, nftId, collectionAddress, salt)`
   - On-chain: Note state → Valid, NFT registration recorded

2. **User A → User B transfer**: Generate ZK proof in browser then call `transferNFT()`
   - `oldNftHash = Poseidon(A.pkX, A.pkY, nftId, collection, oldSalt)`
   - `newNftHash = Poseidon(B.pkX, B.pkY, nftId, collection, newSalt)`
   - `nullifier = Poseidon(nftId, oldSalt, A.sk)`
   - What the ZK proof proves:
     - A knows the secret key (ownership)
     - oldNftHash is correctly calculated
     - newNftHash is correctly calculated
     - nullifier is correctly calculated
     - nftId and collectionAddress are preserved

3. **On-chain Verification**: Groth16 verifier checks proof → Spend old Note + Create new Note

---

## 4.3 F4: Loot Box Open

### Flow Diagram

```
   1. mintBox()          2. registerBox()        3. openBox()
   (ERC20 Payment)       (Register Note)         (ZK Proof + Open)
        │                     │                       │
        ▼                     ▼                       ▼
   Send TON tokens       Create Box Note         Decide outcome with Poseidon VRF
   Issue Box ID          Encrypted Storage       Verify rarityTier
   Record owner                                  Spend Box Note
                                                  Create Outcome Note
```

### VRF-based Random Drop

```
vrfOutput = Poseidon(secretKey, nullifier)
rarity = vrfOutput % 10000

Rarity thresholds (cumulative):
  [100, 500, 2000, 10000]
  → 0~99:     Legendary (1%)
  → 100~499:  Epic      (4%)
  → 500~1999: Rare      (15%)
  → 2000~9999:Common    (80%)
```

**Core Guarantees:**
- VRF output depends on secret key → Unpredictable externally
- VRF output is deterministic → Same input, same result
- ZK proof verifies accuracy of VRF calculation
- Thresholds are cumulative, and the last value must be 10000 (forced in ZK circuit)

---

## 4.4 F5: Gaming Item Trade

### Flow Diagram

```
  Seller                                              Buyer
    │                                                   │
    │ 1. registerItem(noteHash, gameId, itemId)         │
    │ 2. listItem(noteHash, gameId, itemId, price)      │
    │                                                   │
    │ ◄──────── 3. purchaseItem(listingId, buyerPk) ────┤
    │              (ERC20 Escrow Deposit)               │
    │                                                   │
    │ 4. executeTradeForBuyer(ZK proof)                 │
    │    - Spend old Note                               │
    │    - Create new Note (Buyer owned)                │
    │    - Send Escrow amount to Seller                 │
    │                                                   │
    ▼                                                   ▼
  Receive TON                                 Receive Item Note
```

### Key Guarantees (Verified by ZK Circuit)

| Guaranteed Item | Description |
|---|---|
| Preserve attributes | `itemId`, `itemType`, `itemAttributes` remain identical before/after transfer |
| Game ecosystem isolation | `gameId` preserved, preventing item movement between games |
| Seller ownership | Proves seller knows secret key |
| Payment accuracy | Verifies paymentNoteHash if price > 0; free gift if price = 0 |

---

## 4.5 F8: Card Draw Verify

### Flow Diagram

```
  1. registerDeck(deckCommitment, gameId)
     → Register commitment for 52-card shuffled deck
     → Deck is "Persistent" (not consumed)

  2. drawCard(ZK proof, drawIndex)
     → Verify Fisher-Yates shuffle is correct
     → Prove deck[drawIndex] is correct card
     → Block duplicate usage of drawIndex (on-chain mapping)
```

### Fisher-Yates Shuffle (Inside ZK Circuit)

```
for step = 0 to 50:
    i = 51 - step
    r = Poseidon(seed, step)       # Deterministic random
    j = extract14bits(r) % (i + 1) # Swap target
    swap(deck[i], deck[j])         # Multiplexer-based swap
```

- ~99,000 constraints (Heaviests circuit)
- Deck commitment = Recursive Poseidon chain: `h[i] = Poseidon(h[i-1], cards[i+1])`

### Differences between F8 and F1

| Item | F1 (NFT Transfer) | F8 (Card Draw) |
|---|---|---|
| Note Consumption | Spends old Note on transfer | Deck Note is NOT consumed (Persistent) |
| Duplicate Prevention | Nullifier | drawIndex mapping (`drawnCards[gameId][drawIndex]`) |
| Use Case | One-time transfer | Drawing multiple cards from the same deck |

---

## 4.6 F9: Card Draw Game (Multiplayer)

### Game Flow (4 Phases)

```
  Phase 1: Open (Commit)
  ┌─────────────────────────────────────────────────────────────┐
  │ Player A: joinGame(deckCommitment, playerCommitment) + Fee  │
  │ Player B: joinGame(deckCommitment, playerCommitment) + Fee  │
  │ (Max 5, Min 2 players)                                      │
  └──────────────────────┬──────────────────────────────────────┘
                         │ commitTimeout elapses
                         ▼
  Phase 1.5: PendingReveal
  ┌─────────────────────────────────────────────────────────────┐
  │ startReveal() → revealBlock = block.number + 2              │
  │ (Non-existent block → blockhash unpredictable)              │
  └──────────────────────┬──────────────────────────────────────┘
                         │ After block mining
                         ▼
  Phase 2: Revealing
  ┌─────────────────────────────────────────────────────────────┐
  │ finalizeReveal()                                             │
  │ → revealSeed = keccak256(blockhash(revealBlock), prevrandao)│
  │ → drawIndex = keccak256(revealSeed, player, gameId) % 52    │
  │                                                              │
  │ Player A: revealCard(ZK proof, drawCommitment, drawnCard)   │
  │ Player B: revealCard(ZK proof, drawCommitment, drawnCard)   │
  └──────────────────────┬──────────────────────────────────────┘
                         │ Everyone reveals or timeout (120s)
                         ▼
  Phase 3: Finished
  ┌─────────────────────────────────────────────────────────────┐
  │ closeGame() → Highest card wins                              │
  │ Prize = Sum of fees × 90% (10% platform fee)                │
  │ Unrevealed players forfeit fees → accumulatedFees           │
  └─────────────────────────────────────────────────────────────┘
```

### Card Score Calculation

```
Score = rankValue × 4 + (3 - suitIndex)

Rank: A=14, K=13, Q=12, J=11, 10~2
Suit: Spades(0) > Hearts(1) > Diamonds(2) > Clubs(3)

Example: A♠ = 14×4 + 3 = 59 (Highest), 2♣ = 2×4 + 0 = 8 (Lowest)
```

### Randomness Guarantee Mechanism

| Phase | Attempted Attack | Defense |
|---|---|---|
| At Commit | Calc drawIndex beforehand to submit favorable deck | drawIndex is decided AFTER commitment |
| At startReveal | Predict blockhash | revealBlock = block.number + 2 (not yet mined) |
| At finalizeReveal | Validator manipulates block | Double randomness with prevrandao + blockhash |

### Constants

| Constant | Value | Description |
|---|---|---|
| `MAX_PLAYERS` | 5 | Max players per game |
| `MIN_PLAYERS` | 2 | Min players to start |
| `FEE_PERCENT` | 10 | 10% prize pool fee |
| `REVEAL_TIMEOUT` | 120s | Time limit for card reveal |
