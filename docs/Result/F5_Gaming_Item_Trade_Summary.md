# F5 Gaming Item Trade: Demo → Real P2P Marketplace

## Summary

### 1. contracts/GamingItemTrade.sol — Full rewrite

- Added IERC20 paymentToken, admin, nextListingId, Listing struct, listings mapping
- Constructor now takes (address _tradeVerifier, address _paymentToken)
- Kept registerItem() unchanged
- Removed old tradeItem() — replaced with 4 new functions:
  - listItem() — seller lists a valid note with a price
  - purchaseItem() — buyer pays ERC20 into escrow + submits ZK pubkey
  - executeTradeForBuyer() — seller submits ZK proof → spends old note → creates new note for buyer → releases escrow to seller
  - cancelListing() — seller cancels, auto-refunds buyer if they had paid
- getListings() / getListing() view helpers
- 4 new events: ItemListed, ItemPurchased, ItemTradeCompleted, ListingCancelled

### 2. scripts/deploy.js

- Added args: (verifierAddr) => [verifierAddr, tonAddr] to GamingItemTrade entry

### 3. test/GamingItemTrade.test.js — Full rewrite

- 27 unit tests across registerItem (4), listItem (5), purchaseItem (6), executeTradeForBuyer (7), cancelListing (4), getListings (1)

### 4. test/GamingItemTrade.integration.test.js — Full rewrite

- Updated beforeEach to deploy MockERC20 + pass it to contract
- Replaced tradeItem() calls with the full register → list → purchase → execute P2P flow
- Tests: full paid trade, gift trade, chained A→B→C trades, security rejections, events

### 5. frontend/src/lib/noteUtils.ts — 2 functions added

- setupF5SellerItem() — generates seller keypair + computes oldItemHash
- setupF5TradeWithBuyer() — takes buyer's on-chain ZK pubkey, computes newItemHash + circuit inputs for proof generation

### 6. frontend/src/pages/F5GamingItemTradePage.tsx — Full rewrite

- Role selection screen (Seller / Buyer)
- Seller: 6-step flow (configure → register → list → wait for buyer polling → generate proof → execute trade)
- Buyer: polling active listings table (5s), auto-generates local ZK keypair on selection, approve+purchase in one click, then waits for seller's ZK proof
