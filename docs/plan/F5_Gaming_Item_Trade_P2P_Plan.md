# F5 Gaming Item Trade: Demo → Real P2P Marketplace

## Context

현재 F5는 한 사람이 판매자와 구매자 역할을 동시에 수행하는 데모입니다.
`setupF5Trade()`가 seller/buyer 키페어를 모두 내부에서 랜덤 생성 → 실제 거래 느낌이 없음.

**목표**: 판매자가 아이템을 리스팅 → 구매자가 TON으로 결제 + ZK pubkey 제출 → 판매자가 ZK 증명 생성 + 거래 완료하는 실제 P2P 마켓플레이스로 전환.

**제약**: ZK 회로 수정 없음. Circuit public inputs는 `[oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]` 그대로.

---

## 핵심 설계

### ZK 소유권 이전 원리

- seller가 proof 생성 시 `sellerSk(private)` + `buyerPkX/Y`(on-chain에서 읽어옴)를 사용
- `newItemHash = Poseidon(buyerPkX, buyerPkY, itemId, ...)` → buyer의 pubkey가 새 note에 바인딩
- contract는 proof만 검증 (buyerPk는 회로 내부에서 암묵적으로 검증됨)

### 결제 에스크로

- `purchaseItem()` 시 TON을 컨트랙트에 보관
- `executeTradeForBuyer()` 성공 시 seller에게 release
- seller가 증명을 제출하지 않으면 `cancelListing()`으로 buyer 환불

---

## 수정 파일 (6개)

### 1. contracts/GamingItemTrade.sol — 전면 재작성

**추가 import/state**:
```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

IERC20 public paymentToken;
address public admin;
uint256 public nextListingId = 1;

struct Listing {
    address seller;
    bytes32 itemNoteHash;
    uint256 gameId;
    uint256 itemId;
    uint256 price;        // wei (TON)
    bool active;
    address buyer;        // purchaseItem() 후 설정
    uint256 buyerPkX;     // buyer ZK pubkey (on-chain에 저장)
    uint256 buyerPkY;
}
mapping(uint256 => Listing) public listings;
```

**변경된 constructor**:
```solidity
constructor(address _tradeVerifier, address _paymentToken)
```

**유지**: `registerItem()` — 기존과 동일

**제거**: 기존 `tradeItem()` public 함수

**새 함수**:
1. `listItem(bytes32 itemNoteHash, uint256 gameId, uint256 itemId, uint256 price)` — noteExists modifier, price > 0
2. `purchaseItem(uint256 listingId, uint256 buyerPkX, uint256 buyerPkY)` — ERC20 transferFrom → 에스크로
3. `executeTradeForBuyer(uint256 listingId, proof[a,b,c], bytes32 newItemHash, bytes32 paymentNoteHash, bytes32 nullifier, bytes encryptedNote)` — seller only, ZK검증 → `_spendNote` → `_createNote` → payment release
4. `cancelListing(uint256 listingId)` — seller only, buyer 있으면 환불
5. `getListings() view returns (Listing[])`
6. `getListing(uint256 listingId) view returns (Listing)`

**새 이벤트**:
```solidity
event ItemListed(address indexed seller, uint256 indexed listingId, uint256 price);
event ItemPurchased(address indexed buyer, uint256 indexed listingId, uint256 buyerPkX, uint256 buyerPkY);
event ItemTradeCompleted(uint256 indexed listingId, bytes32 oldNote, bytes32 newNote);
event ListingCancelled(uint256 indexed listingId);
```

---

### 2. scripts/deploy.js

GamingItemTrade 항목에 args 추가:
```javascript
{
  verifier: "contracts/verifiers/GamingItemTradeVerifier.sol:Groth16Verifier",
  main: "GamingItemTrade",
  key: "gamingItemTrade",
  args: (verifierAddr) => [verifierAddr, tonAddr],  // ← 추가
}
```

---

### 3. test/GamingItemTrade.test.js — 전면 재작성

**beforeEach**:
```javascript
[owner, seller, buyer] = await ethers.getSigners();
mockToken = await MockERC20.deploy();
await mockToken.mint(seller.address, parseEther("10000"));
await mockToken.mint(buyer.address, parseEther("10000"));
gamingItemTrade = await GamingItemTrade.deploy(verifierAddr, tokenAddr);
```

**테스트 케이스**:

- `registerItem` (4개, 기존 유지)
- `listItem` (5개): 정상 리스팅, 이벤트, price=0 거부, 미존재 note 거부, ID 증가
- `purchaseItem` (6개): 결제 수락, 에스크로 확인, 이벤트, 중복 구매 거부, approval 없이 거부, 0 pubkey 거부
- `executeTradeForBuyer` (7개): 거래 완료, seller 결제 수령, 리스팅 비활성화, 이벤트, non-seller 거부, double-spend 거부, buyer 없을 때 거부
- `cancelListing` (4개): 취소, buyer 환불, 이벤트, non-seller 거부
- `getListings` (1개)

---

### 4. test/GamingItemTrade.integration.test.js

**beforeEach 수정** (constructor 2개 파라미터):
```javascript
const mockToken = await MockERC20.deploy();
await mockToken.mint(buyerAcc.address, parseEther("100000"));
gamingItemTrade = await GamingItemTrade.deploy(verifierAddress, await mockToken.getAddress());
```

기존 `registerItem` + `tradeItem` 사용 테스트들 → `executeTradeForBuyer` 패턴으로 업데이트.

---

### 5. frontend/src/lib/noteUtils.ts — 함수 2개 추가

기존 `setupF5Trade()` 삭제하지 않음.

```typescript
// Seller setup (Step 2: registration)
export type F5SellerSetupResult = {
  seller: Keypair;
  oldItemHash: bigint;
  oldSalt: bigint;
  gameId: bigint;
  itemId: bigint;
  itemType: bigint;
  itemAttributes: bigint;
  price: bigint;
  paymentToken: bigint;
};

export async function setupF5SellerItem(
  itemId, itemType, itemAttributes, gameId, price, paymentToken
): Promise<F5SellerSetupResult>
// - 새 seller keypair + oldSalt 생성
// - oldItemHash = Poseidon(seller.pk.x, seller.pk.y, itemId, ...)

// Seller proof step (Step 5: after buyer purchaseItem)
export async function setupF5TradeWithBuyer(
  sellerSetup: F5SellerSetupResult,
  buyerPkX: bigint,   // listing.buyerPkX (from chain)
  buyerPkY: bigint,   // listing.buyerPkY (from chain)
): Promise<F5SetupResult>
// - newItemHash = Poseidon(buyerPkX, buyerPkY, ...)
// - nullifier = Poseidon(itemId, oldSalt, seller.sk)
// - circuit inputs 생성 (기존 F5SetupResult 타입 재사용)
```

---

### 6. frontend/src/pages/F5GamingItemTradePage.tsx — 전면 재작성

**역할 선택**:
```
[I am a Seller]  [I am a Buyer]
```

**Seller Panel (6단계)**:

| Step | Description |
|------|-------------|
| Step 1 | Configure Item (itemId, type, attrs, gameId, price) |
| Step 2 | Register Item → `setupF5SellerItem()` → `contract.registerItem()` |
| Step 3 | List for Sale → `contract.listItem()` → listingId 발급 |
| Step 4 | Waiting for Buyer (3초 polling, buyer 확인 시 자동 진행) |
| Step 5 | Generate ZK Proof → `setupF5TradeWithBuyer(sellerSetup, listing.buyerPkX, buyerPkY)` |
| Step 6 | Execute Trade → `contract.executeTradeForBuyer()` |

**Buyer Panel**:

Active Listings 테이블 (5초 polling)
- 선택 시 buyer ZK keypair 자동 생성 (로컬)
- Approve TON + `purchaseItem(listingId, buyerPkX, buyerPkY)`
- "Seller가 ZK 증명 생성 대기 중" 메시지

**중요 상태 관리** — sellerSetup은 React state에만 보관 (localStorage X):

```typescript
const [sellerSetup, setSellerSetup] = useState<F5SellerSetupResult | null>(null);
const [listingId, setListingId] = useState<number | null>(null);
const [activeListing, setActiveListing] = useState<OnChainListing | null>(null);
```

---

## 변경하지 않는 파일

- `circuits/` — ZK 회로
- `contracts/NFTNoteBase.sol`
- `contracts/LootBoxOpen.sol`
- `frontend/src/lib/types.ts` — MockERC20 이미 추가됨
- `frontend/src/lib/contracts.ts` — MockERC20 이미 추가됨

---

## 실행 순서

1. `contracts/GamingItemTrade.sol` 재작성
2. `scripts/deploy.js` 수정
3. `npx hardhat compile`
4. `node scripts/copy-frontend-assets.js`
5. `test/GamingItemTrade.test.js` 재작성
6. `npx hardhat test/GamingItemTrade.test.js`
7. `test/GamingItemTrade.integration.test.js` 수정
8. `npx hardhat test` (전체)
9. `frontend/src/lib/noteUtils.ts` 함수 추가
10. `frontend/src/pages/F5GamingItemTradePage.tsx` 재작성
11. `cd frontend && npx tsc --noEmit && npm run build`
<ctrl46>