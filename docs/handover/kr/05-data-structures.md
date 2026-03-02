# 5. 데이터 구조

[< 목차로 돌아가기](./README.md)

---

## 5.1 온체인 데이터 (스마트 컨트랙트 상태)

### NFTNoteBase (공통 기반)

| 변수 | 타입 | 설명 |
|---|---|---|
| `notes` | `mapping(bytes32 => NoteState)` | Note 상태 (0=Invalid, 1=Valid, 2=Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | 사용된 Nullifier |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | 암호화된 Note 데이터 |

### PrivateNFT (F1)

| 변수 | 타입 | 설명 |
|---|---|---|
| `transferVerifier` | `INFTTransferVerifier` | ZK 검증 컨트랙트 주소 |
| `registeredNFTs` | `mapping(address => mapping(uint256 => bool))` | collection → nftId → 등록 여부 |

### LootBoxOpen (F4)

| 변수 | 타입 | 설명 |
|---|---|---|
| `boxVerifier` | `ILootBoxVerifier` | ZK 검증 컨트랙트 |
| `paymentToken` | `IERC20` | 결제 토큰 (TON) |
| `admin` | `address` | 관리자 주소 |
| `boxPrice` | `uint256` | 박스 가격 (기본 10 TON) |
| `nextBoxId` | `uint256` | 다음 박스 ID (auto-increment) |
| `registeredBoxes` | `mapping(uint256 => bool)` | boxId → 등록 여부 |
| `boxOwner` | `mapping(uint256 => address)` | boxId → 소유자 |
| `boxTypes` | `mapping(uint256 => uint256)` | boxId → 박스 타입 |
| `userBoxIds` | `mapping(address => uint256[])` | 사용자별 박스 목록 |

### GamingItemTrade (F5)

| 변수 | 타입 | 설명 |
|---|---|---|
| `tradeVerifier` | `IGamingItemTradeVerifier` | ZK 검증 컨트랙트 |
| `paymentToken` | `IERC20` | 결제 토큰 |
| `nextListingId` | `uint256` | 다음 리스팅 ID |
| `listings` | `mapping(uint256 => Listing)` | 리스팅 상세 |
| `registeredItems` | `mapping(uint256 => mapping(uint256 => bool))` | gameId → itemId → 등록 여부 |

```solidity
struct Listing {
    address seller;       // 판매자 주소
    bytes32 itemNoteHash; // 아이템 Note 해시
    uint256 gameId;       // 게임 생태계 ID
    uint256 itemId;       // 아이템 ID
    uint256 price;        // 판매 가격 (wei)
    bool active;          // 활성 여부
    address buyer;        // 구매자 주소
    uint256 buyerPkX;     // 구매자 BabyJubJub PK X
    uint256 buyerPkY;     // 구매자 BabyJubJub PK Y
}
```

### CardDrawGame (F9)

```solidity
struct Game {
    address creator;           // 게임 생성자
    GameStatus status;         // Open / PendingReveal / Revealing / Finished / Cancelled
    uint256 commitTimeout;     // 커밋 타임아웃 (초)
    uint256 lastJoinTime;      // 마지막 참가 시간
    uint256 playerCount;       // 참가자 수 (최대 5)
    uint256 revealedCount;     // 공개 완료 수
    uint256 prizePool;         // 상금 풀 (wei)
    uint256 revealBlock;       // 시드용 대상 블록 번호
    uint256 prevRandaoSnapshot;// block.prevrandao 스냅샷
    uint256 revealSeed;        // keccak256(blockhash, prevrandao)
    uint256 revealDeadline;    // 공개 기한 (timestamp)
    address winner;            // 승자 주소
    uint256 highestCardValue;  // 최고 카드 값
    uint256 createdAt;         // 생성 시각
}

struct Player {
    address addr;              // 플레이어 주소
    bytes32 deckCommitment;    // 덱 커미트먼트
    bytes32 playerCommitment;  // 플레이어 커미트먼트
    uint256 drawnCard;         // 드로우된 카드 (0-51)
    bool hasCommitted;         // 커밋 완료
    bool hasRevealed;          // 공개 완료
}

enum GameStatus { Open, PendingReveal, Revealing, Finished, Cancelled }
```

---

## 5.2 Note 해시 구조 (ZK 회로 공개 입력)

| 피처 | Note 타입 | 해시 계산 | 입력 수 |
|---|---|---|---|
| F1 | NFT Note | `Poseidon(pkX, pkY, nftId, collectionAddress, salt)` | 5 |
| F4 | Box Note | `Poseidon(pkX, pkY, boxId, boxType, boxSalt)` | 5 |
| F4 | Outcome Note | `Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)` | 5 |
| F5 | Item Note | `Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)` | 7 |
| F5 | Payment Note | `Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)` | 5 |
| F8 | Deck Commit | `DeckCommitment(deckCards[52], deckSalt)` (재귀 체인) | 52+1 |
| F8 | Draw Commit | `Poseidon(drawnCard, drawIndex, gameId, handSalt)` | 4 |
| F8 | Player Commit | `Poseidon(pkX, pkY, gameId)` | 3 |

### Nullifier 계산 (공통)

```
nullifier = Poseidon(itemId, salt, secretKey)
```

- `itemId`: 자산 고유 식별자 (nftId, boxId, itemId 등)
- `salt`: 랜덤 솔트 (Note 생성 시 결정)
- `secretKey`: 소유자의 BabyJubJub 비밀키

---

## 5.3 오프체인 상태 관리 (localStorage)

### 저장소 키

| 키 | 형식 | 설명 |
|---|---|---|
| `neon-arena-notes-{address}` | `StoredNote[]` JSON | 지갑 주소별 UTXO Note 목록 |
| `f9-setup-{gameId}-{address}` | JSON | F9 카드 게임 셋업 데이터 |
| `f5_seller_setups_v1` | JSON | F5 판매자 셋업 캐시 |

### StoredNote 인터페이스

```typescript
interface StoredNote {
  id: string;                          // crypto.randomUUID()
  hash: string;                        // bytes32 Note 해시
  contractName: ContractName;          // 컨트랙트명 (PrivateNFT, LootBoxOpen 등)
  type: "nft" | "lootbox" | "item" | "card";
  label: string;                       // 사용자 식별용 라벨
  metadata: Record<string, string>;    // 추가 메타데이터
  createdAt: number;                   // Date.now()
}
```

### Note Store 동작

- **주소별 분리**: `setNoteStoreAddress(address)` → 지갑마다 독립 저장소
- **레거시 마이그레이션**: 이전 공유 키(`neon-arena-notes`)에서 주소별 키로 자동 이관
- **기능**: 조회, 추가, 삭제, 전체 삭제, JSON export/import
- **중복 방지**: import 시 동일 hash는 skip

---

## 5.4 캐싱 전략

| 대상 | 방식 | 비고 |
|---|---|---|
| Note 데이터 | localStorage | 주소별 분리, import/export 지원 |
| 컨트랙트 인스턴스 | React useMemo | 동일 signer일 때 재사용 |
| ABI/주소 | 정적 JSON import | `deployedAddresses.json` 빌드타임 바인딩 |
| ZK 증명 파일 | Vite public 디렉토리 | `.wasm`, `.zkey` 브라우저 캐시 활용 |
| 서버 캐시 | **없음** | 서버리스 구조 |

---

## 5.5 배포 주소 (localhost 기준)

> `npx hardhat node` + `deploy:local` 실행 시마다 변경된다.

| 컨트랙트 | 주소 |
|---|---|
| MockERC20 (TON) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| PrivateNFT | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |
| LootBoxOpen | `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853` |
| GamingItemTrade | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |
| CardDraw | `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e` |
| CardDrawGame | `0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82` |
