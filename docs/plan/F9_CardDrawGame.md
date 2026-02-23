# F9: Card Draw Game — 멀티플레이어 카드 게임

## Context

- 기존 F8 Card Draw는 한 사람이 덱을 셔플하고 카드를 뽑는 데모.
- **목표**: 게임방을 만들고 여러 명이 참여해서 카드를 뽑고, 가장 높은 카드를 뽑은 사람이 상금을 가져가는 멀티플레이어 게임.
- **제약**: ZK 회로 수정 없음. Circuit public inputs `[deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment]` 그대로.

---

## 핵심 설계

### 게임 흐름

1. **CREATE GAME** (게임방 생성, 누구나 가능)
   ↓
2. **JOIN + DRAW** (참가비 10 TON 결제 + ZK 증명 + 카드 뽑기를 한 트랜잭션으로)
   ↓ (최대 5명, 최소 2명 필요)
   ↓ (마지막 참여 후 timeout 만큼 대기, 새 참여자 없으면 →)
3. **CLOSE GAME** (가장 높은 카드 = 승리, 상금 지급)
   또는 **CANCEL GAME** (참가자 < 2명이면 환불)

### joinGame 원자적(atomic) 설계

- **참가비 결제 + 덱 등록 + ZK 증명 + 카드 제출을 하나의 트랜잭션으로 처리**
- **이유**: drawnCard가 on-chain에 저장되므로 분리하면 뒤늦게 참여하는 사람이 다른 사람 카드를 보고 전략적으로 참여 여부 결정 가능 → 원자적으로 결합하면 자기 카드를 모르는 상태에서 돈을 내야 함
- **프론트엔드에서**: proof 생성(~30초) → ERC20 approve → `joinGame()` 순서

### 카드 랭킹 (승자 결정)

- `rank = cardIndex % 13` (0=A, 1=2, ..., 12=K)
- Ace=14, K=13, Q=12, ..., 2=2 (Ace highest)
- 같은 랭크 → suit tiebreaker: Spades > Hearts > Diamonds > Clubs
- **공식**: `(rank==0 ? 14 : rank+1) * 4 + (3 - suitIndex)` → 카드별 고유 점수

### 상금 분배

- `prizePool` = 참가자 수 × 10 TON
- `수수료` = 10% (컨트랙트에 축적)
- `승자 상금` = `prizePool - 수수료`

### 타임아웃 로직

- `lastJoinTime`: 마지막 참여자의 join 시각 (`block.timestamp`)
- `playerCount < 2`: 타임아웃 제한 없음 (누구나 참여 가능)
- `playerCount >= 2 && now > lastJoinTime + timeout`: 새 참여 불가, `closeGame` 가능
- `playerCount == MAX_PLAYERS (5)`: 즉시 `closeGame` 가능

---

## 수정/생성 파일 (8개)

### 1. NEW: `contracts/CardDrawGame.sol` — 신규 생성

NFTNoteBase 미사용 (standalone 컨트랙트). 게임 로직만 관리.

```solidity
import "./verifiers/IGroth16Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CardDrawGame {
    ICardDrawVerifier public drawVerifier;
    IERC20 public paymentToken;
    address public admin;

    uint256 public constant MAX_PLAYERS = 5;
    uint256 public constant MIN_PLAYERS = 2;
    uint256 public constant FEE_PERCENT = 10;
    uint256 public entryFee;          // 10 ether (10 TON)
    uint256 public defaultTimeout;    // 60 seconds
    uint256 public nextGameId = 1;

    enum GameStatus { Open, Finished, Cancelled }

    struct Game {
        address creator;
        GameStatus status;
        uint256 timeout;
        uint256 lastJoinTime;
        uint256 playerCount;
        uint256 prizePool;
        address winner;
        uint256 highestCardValue;
        uint256 createdAt;
    }

    struct Player {
        address addr;
        uint256 drawnCard;     // 0-51
        bool hasDrawn;
    }

    mapping(uint256 => Game) public games;
    mapping(uint256 => Player[]) internal _players;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    uint256 public accumulatedFees;
}
```

**constructor**:
```solidity
constructor(address _drawVerifier, address _paymentToken, uint256 _entryFee, uint256 _defaultTimeout)
```

**함수 (7개)**:

1. `createGame(uint256 timeout) returns (uint256 gameId)`
   - `timeout >= 30` require
   - `Game` struct 생성, `status=Open`, `createdAt=block.timestamp`
   - emit `GameCreated`
2. `joinGame(uint256 gameId, uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 deckCommitment, bytes32 drawCommitment, uint256 drawIndex, bytes32 playerCommitment, uint256 drawnCard)`
   - require: `Open`, `!hasJoined`, `playerCount < MAX`
   - `playerCount >= MIN`이면 timeout 체크
   - `paymentToken.transferFrom(msg.sender, address(this), entryFee)`
   - ZK proof 검증: `publicInputs = [uint256(deckCommitment), uint256(drawCommitment), drawIndex, gameId, uint256(playerCommitment)]`
   - require `drawnCard < 52`
   - Player 저장, `hasJoined=true`, `prizePool += entryFee`, `lastJoinTime = block.timestamp`
   - emit `PlayerJoined` + `PlayerDrew`
3. `closeGame(uint256 gameId)`
   - require: `Open`, `playerCount >= MIN`
   - require: `playerCount >= MAX` OR `block.timestamp > lastJoinTime + timeout`
   - iterate players → `_cardScore(drawnCard)` → 최고점 찾기
   - `fee = prizePool * FEE_PERCENT / 100`, `prize = prizePool - fee`
   - `accumulatedFees += fee`
   - `paymentToken.transfer(winner, prize)`
   - `status = Finished`
   - emit `GameFinished`
4. `cancelGame(uint256 gameId)`
   - require: `Open`, `creator`만 호출 가능
   - 모든 참가자 `entryFee` 환불
   - `status = Cancelled`
   - emit `GameCancelled`
5. `getGame(uint256 gameId) view returns (Game memory)`
6. `getGamePlayers(uint256 gameId) view returns (Player[] memory)`
7. `withdrawFees(address to)` — admin only, `accumulatedFees` 전송

**내부 함수**:
```solidity
function _cardScore(uint256 card) internal pure returns (uint256) {
    uint256 rank = card % 13;
    uint256 suitIndex = card / 13;
    uint256 rankValue = rank == 0 ? 14 : rank + 1;
    return rankValue * 4 + (3 - suitIndex);
}
```

**이벤트**:
```solidity
event GameCreated(uint256 indexed gameId, address indexed creator, uint256 timeout);
event PlayerJoined(uint256 indexed gameId, address indexed player, uint256 playerCount);
event PlayerDrew(uint256 indexed gameId, address indexed player, uint256 drawnCard);
event GameFinished(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 highestCard);
event GameCancelled(uint256 indexed gameId);
```

### 2. `scripts/deploy.js` — 항목 추가

기존 cardDraw 뒤에 추가:
```javascript
{
  verifier: "contracts/verifiers/CardDrawVerifier.sol:Groth16Verifier",
  main: "CardDrawGame",
  key: "cardDrawGame",
  args: (verifierAddr) => [verifierAddr, tonAddr, ENTRY_FEE, DEFAULT_TIMEOUT],
}
```

상수 추가:
```javascript
const ENTRY_FEE = hre.ethers.parseEther("10");  // 10 TON
const DEFAULT_TIMEOUT = 60;                       // 60 seconds
```

### 3. `scripts/copy-frontend-assets.js` — ABI 추가

`abis` 배열에 추가:
```javascript
{ artifact: "artifacts/contracts/CardDrawGame.sol/CardDrawGame.json", output: "CardDrawGame.json" },
```

### 4. NEW: `test/CardDrawGame.test.js` — 유닛 테스트

**beforeEach**:
```javascript
[owner, player1, player2, player3, player4, player5] = await ethers.getSigners();
mockToken = await MockERC20.deploy();
// 모든 플레이어에 10,000 TON 민팅
mockVerifier = await MockCardDrawVerifier.deploy();
cardDrawGame = await CardDrawGame.deploy(verifierAddr, tokenAddr, ENTRY_FEE, DEFAULT_TIMEOUT);
```

**헬퍼**:
```javascript
async function joinWithCard(player, gameId, cardIndex) {
  await mockToken.connect(player).approve(contractAddr, ENTRY_FEE);
  const mockProof = { a: [0,0], b: [[0,0],[0,0]], c: [0,0] };
  const hashes = { deck: keccak256(...), draw: keccak256(...), player: keccak256(...) };
  await contract.connect(player).joinGame(gameId, ...mockProof, ...hashes, 0, cardIndex);
}
```

**테스트 케이스 (~22개)**:
- **createGame** (3개): 정상 생성, minimum timeout 거부, ID 자동 증가
- **joinGame** (7개): 정상 참여, ERC20 미승인 거부, 중복 참여 거부, 5명 초과 거부, timeout 후 참여 거부, timeout 전 참여 허용, 2명 미만일 때 timeout 무시
- **closeGame** (6개): 정상 종료 + 상금 지급, 카드 랭킹 정확성 (Ace > King), suit tiebreaker, timeout 전 종료 거부, 2명 미만 종료 거부, MAX_PLAYERS 도달 시 즉시 종료
- **cancelGame** (3개): 환불, non-creator 거부, 빈 게임 취소
- **admin** (2개): fee 출금, non-admin 출금 거부
- **getters** (1개): `getGamePlayers`

### 5. `frontend/src/lib/types.ts` — ContractName 추가

```typescript
export const CONTRACT_NAMES = {
  // ...기존...
  CARD_DRAW_GAME: "CardDrawGame",  // 추가
} as const;
```

### 6. `frontend/src/lib/contracts.ts` — ABI/주소 매핑

```typescript
import CardDrawGameAbi from "../abi/CardDrawGame.json";

// ABI_MAP에 추가:
CardDrawGame: CardDrawGameAbi,

// ADDRESS_MAP에 추가:
CardDrawGame: (deployedAddresses as Record<string, string>).cardDrawGame,
```

### 7. NEW: `frontend/src/pages/CardDrawGamePage.tsx` — 게임 UI

**두 개의 화면**:

#### 화면 1: Game List (기본)
```text
┌─────────────────────────────────────┐
│ F9: Card Draw Game                  │
│ [CREATE GAME] (timeout 입력)        │
│                                     │
│ ┌──────────────────────────────────┐│
│ │ #1 │ 3/5 │ 30 TON │ ⏱ 0:45       ││
│ │     [JOIN]                       ││
│ ├──────────────────────────────────┤│
│ │ #2 │ 1/5 │ 10 TON │ 대기 중      ││
│ │     [JOIN]                       ││
│ ├──────────────────────────────────┤│
│ │ #3 │ 3/5 │ FINISHED │ 승자: K♠  ││
│ └──────────────────────────────────┘│
└─────────────────────────────────────┘
```

- 5초 polling으로 게임 목록 갱신
- 각 게임: ID, 참가자수/MAX, 상금, 카운트다운 타이머 or 상태
- 카운트다운: `playerCount < 2` → "대기 중", `>= 2` → `lastJoinTime + timeout - now` 표시, 만료 → "READY TO CLOSE"
- 1초 interval로 타이머 갱신

#### 화면 2: Game Room (참여 후)
```text
┌──────────────────────────────────────┐
│ ← Back │ Game #1 │ OPEN │ ⏱ 0:45   │
│                                      │
│ Players (3/5):                       │
│ ┌──────────────────────────────────┐ │
│ │ 0x7099...79C8  │  🂠 (hidden)   │ │
│ │ 0x3C44...93BC  │  🂠 (hidden)   │ │
│ │ 0xYOU (나)     │  🂠 (drawn ✓)  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [CLOSE GAME] (조건 충족 시 활성화)    │
│                                      │
│ ──── 게임 종료 후 ────               │
│ 🏆 Winner: 0x7099... │ K♠ (59pts)  │
│ Prize: 27 TON (30 - 3 fee)           │
│                                      │
│ All Cards:                           │
│ 0x7099: K♠  │ 0x3C44: 8♥ │ You: 3♦ │
└──────────────────────────────────────┘
```

**참여(JOIN) 플로우 (버튼 클릭 시)**:
1. `setupF8Game(BigInt(gameId))` → 키페어, 셔플, commitment 생성
2. `prepareF8Draw(game, 0)` → drawIndex=0, circuit inputs 준비
3. `generateF8Proof(circuitInputs)` → ~30초 proof 생성 (ProofStatus 표시)
4. `tokenContract.approve(gameAddr, ENTRY_FEE)` → ERC20 승인
5. `gameContract.joinGame(gameId, a, b, c, deckCommitment, drawCommitment, 0, playerCommitment, drawnCard)` → 참여+카드 제출
6. 3초 polling으로 게임 상태 갱신

**카드 표시**:
- 게임 진행 중: 다른 사람 카드 = "?" (숨김), 내 카드는 로컬에 저장
- 게임 종료 후: 모든 카드 공개 (contract에서 읽어옴)
- 카드 UI는 `F8CardDrawPage.tsx`의 `playing-card` CSS 재사용

**기존 함수 재사용 (cardUtils.ts 수정 없음)**:
```typescript
import { setupF8Game, prepareF8Draw, generateF8Proof, getCardName } from "../lib/cardUtils";
```

### 8. `frontend/src/App.tsx` + `Layout.tsx` — 라우팅/네비게이션

**App.tsx**:
```tsx
import { CardDrawGamePage } from "./pages/CardDrawGamePage";
// Route 추가:
<Route path="/f9-card-game" element={<CardDrawGamePage />} />
```

**Layout.tsx NAV_ITEMS (F8과 My Notes 사이)**:
```tsx
{ path: "/f9-card-game", label: "F9: Card Game", icon: "◈", color: "neon-text-yellow" },
```

---

## 변경하지 않는 파일

- `circuits/` — ZK 회로
- `contracts/CardDraw.sol` — 기존 F8 데모 유지
- `contracts/NFTNoteBase.sol`
- `frontend/src/lib/cardUtils.ts` — 기존 함수 그대로 재사용
- `frontend/src/pages/F8CardDrawPage.tsx` — 기존 데모 유지

---

## 실행 순서

1. `contracts/CardDrawGame.sol` 작성
2. `scripts/deploy.js` 수정
3. `scripts/copy-frontend-assets.js` 수정
4. `npx hardhat compile`
5. `test/CardDrawGame.test.js` 작성
6. `npx hardhat test test/CardDrawGame.test.js`
7. `frontend/src/lib/types.ts` 수정
8. `frontend/src/lib/contracts.ts` 수정
9. `npx hardhat node` + `npx hardhat run scripts/deploy.js --network localhost`
10. `node scripts/copy-frontend-assets.js`
11. `frontend/src/pages/CardDrawGamePage.tsx` 작성
12. `frontend/src/App.tsx` + `Layout.tsx` 수정
13. `cd frontend && npx tsc --noEmit && npm run build`

---

## 검증 방법

1. **컨트랙트 테스트**: `npx hardhat test test/CardDrawGame.test.js` — 22개 테스트 통과
2. **전체 테스트**: `npx hardhat test` — 기존 151개 + 신규 ~22개 통과
3. **프론트엔드 빌드**: `cd frontend && npx tsc --noEmit && npm run build` — 에러 없음
4. **E2E 수동 테스트 (브라우저)**:
   - Account 1: Create Game → Account 2: Join → Account 1: Join → timeout 대기 → Close
   - 승자에게 상금 지급 확인
   - Cancel Game 환불 확인