# 6. API 명세

[< 목차로 돌아가기](./README.md)

---

> 이 프로젝트는 REST API가 없다. 모든 상호작용은 **스마트 컨트랙트 함수 호출**로 이루어진다.

---

## 6.1 PrivateNFT (F1)

| 함수 | 타입 | 파라미터 | 설명 |
|---|---|---|---|
| `registerNFT` | write | `noteHash, collection, nftId, encryptedNote` | NFT를 프라이버시 시스템에 등록 |
| `transferNFT` | write | `a[2], b[2][2], c[2], oldNftHash, newNftHash, nftId, collectionAddress, nullifier, encryptedNote` | ZK 증명으로 NFT 전송 |
| `getNoteState` | view | `noteHash` | Note 상태 조회 (0=Invalid, 1=Valid, 2=Spent) |
| `isNullifierUsed` | view | `nullifier` | Nullifier 사용 여부 |

**ZK Public Inputs (5개):** `oldNftHash, newNftHash, nftId, collectionAddress, nullifier`

---

## 6.2 LootBoxOpen (F4)

| 함수 | 타입 | 파라미터 | 설명 |
|---|---|---|---|
| `mintBox` | write | `boxType` | ERC20 결제 후 박스 발급 |
| `registerBox` | write | `noteHash, boxId, encryptedNote` | 박스 Note 등록 (소유자만) |
| `openBox` | write | `a[2], b[2][2], c[2], boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier, encryptedNote` | ZK 증명으로 박스 개봉 |
| `getMyBoxes` | view | `user (address)` | 사용자의 박스 ID 목록 |
| `getBoxInfo` | view | `boxId` | 박스 정보 (소유자, 타입, 등록 여부) |
| `setBoxPrice` | write | `price` | 가격 변경 (admin) |
| `withdrawTokens` | write | `to (address)` | 토큰 인출 (admin) |

**ZK Public Inputs (5개):** `boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier`

---

## 6.3 GamingItemTrade (F5)

| 함수 | 타입 | 파라미터 | 설명 |
|---|---|---|---|
| `registerItem` | write | `noteHash, gameId, itemId, encryptedNote` | 아이템 등록 |
| `listItem` | write | `itemNoteHash, gameId, itemId, price` | 판매 등록 |
| `purchaseItem` | write | `listingId, buyerPkX, buyerPkY` | 에스크로 결제 + PK 제출 |
| `executeTradeForBuyer` | write | `listingId, a[2], b[2][2], c[2], newItemHash, paymentNoteHash, nullifier, encryptedNote` | ZK 증명으로 거래 완료 |
| `cancelListing` | write | `listingId` | 리스팅 취소 (환불 포함) |
| `getListings` | view | - | 전체 리스팅 조회 |
| `getListing` | view | `listingId` | 단일 리스팅 조회 |

**ZK Public Inputs (5개):** `oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier`

---

## 6.4 CardDraw (F8)

| 함수 | 타입 | 파라미터 | 설명 |
|---|---|---|---|
| `registerDeck` | write | `deckCommitment, gameId, encryptedNote` | 셔플된 덱 등록 |
| `drawCard` | write | `a[2], b[2][2], c[2], deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, encryptedCardNote` | ZK 증명으로 카드 드로우 |

**ZK Public Inputs (5개):** `deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment`

---

## 6.5 CardDrawGame (F9)

| 함수 | 타입 | 파라미터 | 설명 |
|---|---|---|---|
| `createGame` | write | `commitTimeout` | 게임 룸 생성 |
| `joinGame` | write | `gameId, deckCommitment, playerCommitment` | 참가 + 참가비 (ERC20) |
| `startReveal` | write | `gameId` | 공개 단계 시작 (revealBlock 설정) |
| `finalizeReveal` | write | `gameId` | revealSeed 확정 |
| `revealCard` | write | `gameId, a[2], b[2][2], c[2], drawCommitment, drawnCard` | ZK 증명으로 카드 공개 |
| `closeGame` | write | `gameId` | 게임 종료 + 승자 결정 |
| `cancelGame` | write | `gameId` | 게임 취소 (Open 단계만) |
| `getPlayerDrawIndex` | view | `gameId, player` | drawIndex 계산 |
| `withdrawFees` | write | `to (address)` | 수수료 인출 (admin) |

**ZK Public Inputs (5개):** `deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment`

---

## 6.6 공통 이벤트

### NFTNoteBase (모든 컨트랙트에서 발행)

| 이벤트 | 파라미터 | 용도 |
|---|---|---|
| `NoteCreated` | `noteHash (indexed), encryptedNote` | Note 생성 추적 |
| `NoteSpent` | `noteHash (indexed), nullifier (indexed)` | Note 소비 추적 |

### PrivateNFT

| 이벤트 | 파라미터 |
|---|---|
| `NFTRegistered` | `collection (indexed), nftId (indexed), noteHash` |
| `NFTTransferred` | `oldNoteHash (indexed), newNoteHash (indexed), nullifier` |

### LootBoxOpen

| 이벤트 | 파라미터 |
|---|---|
| `BoxMinted` | `buyer (indexed), boxId (indexed), boxType` |
| `BoxRegistered` | `boxId (indexed), noteHash` |
| `BoxOpened` | `boxCommitment (indexed), outcomeCommitment (indexed), nullifier, vrfOutput` |
| `PriceUpdated` | `newPrice` |

### GamingItemTrade

| 이벤트 | 파라미터 |
|---|---|
| `ItemRegistered` | `gameId (indexed), itemId (indexed), noteHash` |
| `ItemListed` | `seller (indexed), listingId (indexed), price` |
| `ItemPurchased` | `buyer (indexed), listingId (indexed), buyerPkX, buyerPkY` |
| `ItemTradeCompleted` | `listingId (indexed), oldNote, newNote` |
| `ListingCancelled` | `listingId (indexed)` |

### CardDrawGame

| 이벤트 | 파라미터 |
|---|---|
| `GameCreated` | `gameId (indexed), creator (indexed), commitTimeout` |
| `PlayerCommitted` | `gameId (indexed), player (indexed), playerCount` |
| `RevealPending` | `gameId (indexed), revealBlock` |
| `RevealStarted` | `gameId (indexed), revealSeed, revealDeadline` |
| `PlayerRevealed` | `gameId (indexed), player (indexed), drawnCard, drawIndex` |
| `GameFinished` | `gameId (indexed), winner (indexed), prize, highestCard` |
| `GameCancelled` | `gameId (indexed)` |
