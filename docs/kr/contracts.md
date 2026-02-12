# 스마트 컨트랙트 아키텍처

## 개요

모든 컨트랙트는 Solidity 0.8.20으로 작성되었으며, Hardhat과 Foundry를 모두 사용하여 컴파일되고 Paris EVM 타겟을 사용합니다.

### 컨트랙트 계층 구조

```
NFTNoteBase (베이스)
├── PrivateNFT (F1: 비공개 NFT 전송)
├── LootBoxOpen (F4: 루트 박스 개봉)
├── GamingItemTrade (F5: 게임 아이템 거래)
└── CardDraw (F8: 카드 뽑기 검증)

IGroth16Verifier.sol (인터페이스)
├── INFTTransferVerifier → PrivateNftTransferVerifier.sol (자동 생성)
│                        → MockNFTTransferVerifier.sol (테스트용)
├── ILootBoxVerifier → LootBoxOpenVerifier.sol (자동 생성)
│                    → MockLootBoxVerifier.sol (테스트용)
├── IGamingItemTradeVerifier → GamingItemTradeVerifier.sol (자동 생성)
│                            → MockGamingItemTradeVerifier.sol (테스트용)
└── ICardDrawVerifier → CardDrawVerifier.sol (자동 생성)
                      → MockCardDrawVerifier.sol (테스트용)
```

---

## NFTNoteBase

**파일**: `contracts/NFTNoteBase.sol`

UTXO 스타일의 노트 관리 및 널리파이어(nullifier) 추적 기능을 제공하는 베이스 컨트랙트이며, F1, F4, F5, F8에서 공통으로 사용됩니다.

### 상태 (State)

| 변수명 | 타입 | 설명 |
|----------|------|-------------|
| `notes` | `mapping(bytes32 => NoteState)` | 노트 해시별 상태 (Invalid/Valid/Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | 널리파이어 사용 여부 |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | 노트 해시별 ECDH 암호 데이터 |

### NoteState 열거형 (Enum)

| 값 | 이름 | 설명 |
|-------|------|-------------|
| 0 | Invalid | 존재하지 않는 노트 |
| 1 | Valid | 활성화된 노트 |
| 2 | Spent | 이미 소비된 노트 |

### 내부 함수

| 함수 | 설명 |
|----------|-------------|
| `_createNote(noteHash, encryptedNote)` | 새로운 'Valid' 노트를 생성합니다. 이미 존재하면 되돌립니다. |
| `_spendNote(noteHash, nullifier)` | 노트를 'Spent' 상태로 변경하고 널리파이어를 기록합니다. 노트가 'Valid'가 아니거나 널리파이어가 이미 사용된 경우 되돌립니다. |

### 이벤트

| 이벤트 | 파라미터 | 발생 시점 |
|-------|------------|------------|
| `NoteCreated` | `noteHash (indexed), encryptedNote` | 노트 생성 시 |
| `NoteSpent` | `noteHash (indexed), nullifier (indexed)` | 노트 소비 시 |

### 제어자 (Modifiers)

| 제어자 | 조건 |
|----------|-----------|
| `noteExists(noteHash)` | `notes[noteHash] == NoteState.Valid` |
| `nullifierNotUsed(nullifier)` | `!nullifiers[nullifier]` |

---

## PrivateNFT (F1)

**파일**: `contracts/PrivateNFT.sol`

`NFTNoteBase`를 상속받으며, 영지식 증명을 사용하여 비공개 NFT 전송을 관리합니다.

### 상태 (State)

| 변수명 | 타입 | 설명 |
|----------|------|-------------|
| `transferVerifier` | `INFTTransferVerifier` | ZK 증명 검증기 컨트랙트 |
| `registeredNFTs` | `mapping(address => mapping(uint256 => bool))` | 컬렉션 -> NFT ID -> 등록 여부 |

### 함수

#### `registerNFT(noteHash, collection, nftId, encryptedNote)`

시스템에 NFT를 비공개로 등록합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `noteHash` | `bytes32` | NFT 노트 커밋먼트 |
| `collection` | `address` | NFT 컬렉션 컨트랙트 주소 |
| `nftId` | `uint256` | NFT 토큰 ID |
| `encryptedNote` | `bytes` | ECDH 암호화된 노트 데이터 |

**실패 조건**: 동일한 컬렉션/nftId가 이미 등록된 경우 "NFT already registered"와 함께 되돌립니다.

#### `transferNFT(a, b, c, oldNftHash, newNftHash, nftId, collectionAddress, nullifier, encryptedNote)`

영지식 증명을 활용하여 NFT를 비공개로 전송합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 증명 포인트 |
| `oldNftHash` | `bytes32` | 현재 노트 해시 |
| `newNftHash` | `bytes32` | 새로운 노트 해시 (새 소유자) |
| `nftId` | `uint256` | NFT 토큰 ID |
| `collectionAddress` | `address` | 컬렉션 주소 |
| `nullifier` | `bytes32` | 널리파이어 |
| `encryptedNote` | `bytes` | 새로운 암호화된 노트 |

**검증기 공개 입력**: `[oldNftHash, newNftHash, nftId, collectionAddress, nullifier]`

**실패 조건**: "Invalid transfer proof", "Note does not exist or already spent", "Nullifier already used"

### 이벤트 (Events)

| 이벤트 | 파라미터 |
|-------|------------|
| `NFTRegistered` | `collection (indexed), nftId (indexed), noteHash` |
| `NFTTransferred` | `oldNoteHash (indexed), newNoteHash (indexed), nullifier` |

---

## LootBoxOpen (F4)

**파일**: `contracts/LootBoxOpen.sol`

`NFTNoteBase`를 상속받으며, 영지식 증명을 사용하여 검증 가능한 무작위 루트 박스 개봉을 관리합니다.

### 상태 (State)

| 변수명 | 타입 | 설명 |
|----------|------|-------------|
| `lootBoxVerifier` | `ILootBoxVerifier` | ZK 증명 검증기 컨트랙트 |
| `registeredBoxes` | `mapping(uint256 => bool)` | BoxId -> 등록 여부 |

### 함수

#### `registerBox(noteHash, boxId, encryptedNote)`

봉인된 루트 박스를 시스템에 등록합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `noteHash` | `bytes32` | 박스 노트 커밋먼트 |
| `boxId` | `uint256` | 박스 식별자 |
| `encryptedNote` | `bytes` | ECDH 암호화된 노트 데이터 |

**실패 조건**: 동일한 boxId가 이미 등록된 경우 "Box already registered"와 함께 되돌립니다.

#### `openBox(a, b, c, boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier, encryptedNote)`

유효한 VRF 및 등급 결정에 대한 ZK 증명과 함께 루트 박스를 개봉합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 증명 포인트 |
| `boxCommitment` | `bytes32` | 봉인된 박스 노트 해시 |
| `outcomeCommitment` | `bytes32` | 결과물 아이템 노트 해시 |
| `vrfOutput` | `uint256` | VRF 출력 값 |
| `boxId` | `uint256` | 박스 식별자 |
| `nullifier` | `bytes32` | 널리파이어 |
| `encryptedNote` | `bytes` | 암호화된 결과물 노트 |

**검증기 공개 입력**: `[boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier]`

**실패 조건**: "Invalid loot box proof", "Note does not exist or already spent", "Nullifier already used"

### 이벤트 (Events)

| 이벤트 | 파라미터 |
|-------|------------|
| `BoxRegistered` | `boxId (indexed), noteHash` |
| `BoxOpened` | `boxCommitment (indexed), outcomeCommitment (indexed), nullifier, vrfOutput` |

---

## GamingItemTrade (F5)

**파일**: `contracts/GamingItemTrade.sol`

`NFTNoteBase`를 상속받으며, 결제 기능을 포함한 비공개 게임 아이템 거래를 관리합니다.

### 상태 (State)

| 변수명 | 타입 | 설명 |
|----------|------|-------------|
| `tradeVerifier` | `IGamingItemTradeVerifier` | ZK 증명 검증기 컨트랙트 |
| `registeredItems` | `mapping(uint256 => mapping(uint256 => bool))` | GameId -> ItemId -> 등록 여부 |

### 함수

#### `registerItem(noteHash, gameId, itemId, encryptedNote)`

비공개 거래 시스템에 게임 아이템을 등록합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `noteHash` | `bytes32` | 아이템 노트 커밋먼트 |
| `gameId` | `uint256` | 게임 생태계 식별자 |
| `itemId` | `uint256` | 아이템 토큰 ID |
| `encryptedNote` | `bytes` | ECDH 암호화된 노트 데이터 |

**실패 조건**: 동일한 gameId/itemId가 이미 등록된 경우 "Item already registered"와 함께 되돌립니다.

> 동일한 `itemId`라도 `gameId`가 다르면 다른 게임 생태계에서 개별적으로 등록 가능합니다.

#### `tradeItem(a, b, c, oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier, encryptedNote)`

영지식 증명을 사용하여 아이템을 비공개로 거래합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 증명 포인트 |
| `oldItemHash` | `bytes32` | 현재 아이템 노트 해시 |
| `newItemHash` | `bytes32` | 새로운 아이템 노트 해시 (새 소유자) |
| `paymentNoteHash` | `bytes32` | 지불 노트 해시 (선물인 경우 0x0) |
| `gameId` | `uint256` | 게임 생태계 식별자 |
| `nullifier` | `bytes32` | 널리파이어 |
| `encryptedNote` | `bytes` | 새로운 암호화된 노트 |

**검증기 공개 입력**: `[oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]`

**실패 조건**: "Invalid trade proof", "Note does not exist or already spent", "Nullifier already used"

### 이벤트 (Events)

| 이벤트 | 파라미터 |
|-------|------------|
| `ItemRegistered` | `gameId (indexed), itemId (indexed), noteHash` |
| `ItemTraded` | `oldItemHash (indexed), newItemHash (indexed), nullifier` |

---

## CardDraw (F8)

**파일**: `contracts/CardDraw.sol`

`NFTNoteBase`를 상속받으며, 영지식 증명을 사용하여 Fisher-Yates로 셔플된 덱에서 검증 가능한 카드 뽑기를 관리합니다.

### 핵심 설계: 영속적 덱 (Persistent Deck)

노트가 작업당 소비(`Spent`)되는 F1/F4/F5와 달리, CardDraw의 덱 커밋먼트는 **영속적(persistent)**입니다. 즉, 여러 번 카드를 뽑는 동안에도 `Valid` 상태를 유지합니다. 중복 드로우 방지를 위해 널리파이이 대신 `drawIndex` 추적 방식을 사용합니다.

### 상태 (State)

| 변수명 | 타입 | 설명 |
|----------|------|-------------|
| `drawVerifier` | `ICardDrawVerifier` | ZK 증명 검증기 컨트랙트 |
| `registeredDecks` | `mapping(uint256 => bytes32)` | GameId -> 덱 커밋먼트 |
| `drawnCards` | `mapping(uint256 => mapping(uint256 => bool))` | GameId -> DrawIndex -> 드로우 여부 |

### 함수

#### `registerDeck(deckCommitment, gameId, encryptedNote)`

게임 세션을 위한 셔플된 덱을 등록합니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `deckCommitment` | `bytes32` | 덱 노트 커밋먼트 (재귀 Poseidon 체인) |
| `gameId` | `uint256` | 게임 세션 식별자 |
| `encryptedNote` | `bytes` | ECDH 암호화된 덱 데이터 |

**실패 조건**: 동일한 gameId에 대해 이미 덱이 등록된 경우 "Deck already registered for this game"과 함께 되돌립니다.

#### `drawCard(a, b, c, deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, encryptedCardNote)`

영지식 증명을 사용하여 등록된 덱에서 카드를 뽑습니다.

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `a`, `b`, `c` | `uint256[2]`, `uint256[2][2]`, `uint256[2]` | Groth16 증명 포인트 |
| `deckCommitment` | `bytes32` | 덱 노트 해시 |
| `drawCommitment` | `bytes32` | 드로우된 카드 커밋먼트 |
| `drawIndex` | `uint256` | 드로우할 덱 내 위치 (0-51) |
| `gameId` | `uint256` | 게임 세션 식별자 |
| `playerCommitment` | `bytes32` | Poseidon(pkX, pkY, gameId) |
| `encryptedCardNote` | `bytes` | 암호화된 드로우 카드 데이터 |

**검증기 공개 입력**: `[deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment]`

**실패 조건**: "Invalid card draw proof", "Deck not registered for this game", "Deck note not valid", "Card already drawn at this index"

### 이벤트 (Events)

| 이벤트 | 파라미터 |
|-------|------------|
| `DeckRegistered` | `gameId (indexed), deckCommitment` |
| `CardDrawn` | `deckCommitment (indexed), drawCommitment (indexed), drawIndex, gameId, playerCommitment` |

---

## 검증기 인터페이스 (Verifier Interfaces)

**파일**: `contracts/verifiers/IGroth16Verifier.sol`

모든 네 인터페이스는 동일한 시그니처(5개의 공개 입력)를 가집니다.

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

interface ICardDrawVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}
```

### 생성된 검증기 (Generated Verifiers)

| 파일 | 생성 단계 | 컨트랙트 명 |
|------|---------------|---------------|
| `PrivateNftTransferVerifier.sol` | F1 회로 zkey | `Groth16Verifier` |
| `LootBoxOpenVerifier.sol` | F4 회로 zkey | `Groth16Verifier` |
| `GamingItemTradeVerifier.sol` | F5 회로 zkey | `Groth16Verifier` |
| `CardDrawVerifier.sol` | F8 회로 zkey | `Groth16Verifier` |

> snarkjs의 기본값에 따라 네 컨트랙트 모두 이름이 `Groth16Verifier`입니다. Hardhat에서는 다음과 같이 정규화된 경로를 사용하십시오:
> ```javascript
> ethers.getContractFactory("contracts/verifiers/CardDrawVerifier.sol:Groth16Verifier")
> ```

### 모의 검증기 (Mock Verifiers)

단위 테스트(Hardhat 및 Foundry)를 위해 항상 `true`를 반환하는 모의 검증기를 사용합니다.

| 파일 | 구현 인터페이스 | 사용처 |
|------|------------|---------|
| `test/MockNFTTransferVerifier.sol` | `INFTTransferVerifier` | Hardhat + Foundry 테스트 |
| `test/MockLootBoxVerifier.sol` | `ILootBoxVerifier` | Hardhat + Foundry 테스트 |
| `test/MockGamingItemTradeVerifier.sol` | `IGamingItemTradeVerifier` | Hardhat + Foundry 테스트 |
| `test/MockCardDrawVerifier.sol` | `ICardDrawVerifier` | Hardhat + Foundry 테스트 |

---

## 증명 형식 (Proof Format)

snarkjs는 Groth16 증명을 `{pi_a, pi_b, pi_c}` 형식으로 출력합니다. 솔리디티 검증기는 `(uint[2] a, uint[2][2] b, uint[2] c)`를 요구합니다.

**중요**: `b` 좌표의 순서는 반드시 재조정되어야 합니다:

```javascript
// snarkjs 출력 → Solidity 입력
a = [proof.pi_a[0], proof.pi_a[1]];
b = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],   // 반전됨!
  [proof.pi_b[1][1], proof.pi_b[1][0]]     // 반전됨!
];
c = [proof.pi_c[0], proof.pi_c[1]];
```

---

## Foundry 테스트

Foundry (Forge) 테스트는 `test/foundry/`에 위치하며 어설션, 이벤트 확인, 퍼즈(fuzz) 테스트를 위해 forge-std를 사용합니다.

### 테스트 파일

| 파일 | 테스트 컨트랙트 | 테스트 수 | 퍼즈 테스트 |
|------|----------|-------|------|
| `test/foundry/PrivateNFT.t.sol` | `PrivateNFTTest` | 14 | 1 (256회 실행) |
| `test/foundry/LootBoxOpen.t.sol` | `LootBoxOpenTest` | 15 | 2 (256회 실행) |
| `test/foundry/GamingItemTrade.t.sol` | `GamingItemTradeTest` | 17 | 2 (256회 실행) |
| `test/foundry/CardDraw.t.sol` | `CardDrawTest` | 15 | 2 (256회 실행) |

### 테스트 패턴

각 테스트 파일은 일관된 구조를 따릅니다:

```solidity
contract PrivateNFTTest is Test {
    // 1. setUp()에서 모의 검증기 및 컨트랙트 배포
    // 2. test_*(): 정상 데이터 테스트
    // 3. test_RevertWhen_*(): 예상되는 실패(Revert) 케이스 테스트
    // 4. testFuzz_*(): vm.assume() 가드를 사용한 퍼즈 테스트
}
```

### 주요 Forge 기능

| 기능 | 용도 |
|---------|-------|
| `vm.expectRevert(msg)` | 특정 오류 메시지로 되돌아가는지 검증 |
| `vm.expectEmit(...)` | 인덱스/비인덱스 인자로 이벤트 발생 검증 |
| `vm.assume(cond)` | 유효하지 않은 퍼즈 입력 필터링 |
| `assertEq`, `assertTrue` | 상태 어설션 |

### 실행 방법

```bash
# 모든 테스트 상세 실행
forge test -vv

# 가스 보고서 출력
forge test --gas-report

# 특정 컨트랙트만 테스트
forge test --match-contract GamingItemTradeTest -vv
forge test --match-contract CardDrawTest -vv
```

---

## 배포 (Deployment)

생성자 파라미터는 다음과 같습니다:

| 컨트랙트 | 생성자 인자 | 설명 |
|----------|----------------|-------------|
| `PrivateNFT` | `address _transferVerifier` | 배포된 `PrivateNftTransferVerifier` 주소 |
| `LootBoxOpen` | `address _lootBoxVerifier` | 배포된 `LootBoxOpenVerifier` 주소 |
| `GamingItemTrade` | `address _tradeVerifier` | 배포된 `GamingItemTradeVerifier` 주소 |
| `CardDraw` | `address _drawVerifier` | 배포된 `CardDrawVerifier` 주소 |

### 배포 순서

1. `Groth16Verifier` 배포 (`PrivateNftTransferVerifier.sol`에서)
2. `PrivateNFT(verifierAddress)` 배포
3. `Groth16Verifier` 배포 (`LootBoxOpenVerifier.sol`에서)
4. `LootBoxOpen(verifierAddress)` 배포
5. `Groth16Verifier` 배포 (`GamingItemTradeVerifier.sol`에서)
6. `GamingItemTrade(verifierAddress)` 배포
7. `Groth16Verifier` 배포 (`CardDrawVerifier.sol`에서)
8. `CardDraw(verifierAddress)` 배포
