# 스마트 컨트랙트 아키텍처

## 개요

모든 컨트랙트는 Solidity 0.8.20으로 작성되었으며, Hardhat과 Foundry를 모두 사용하여 컴파일되고 Paris EVM 타겟을 사용합니다.

### 컨트랙트 계층 구조

```
NFTNoteBase (기본형)
├── PrivateNFT (F1: 비공개 NFT 전송)
└── GamingItemTrade (F5: 게임 아이템 거래)

IGroth16Verifier.sol (인터페이스)
├── INFTTransferVerifier → PrivateNftTransferVerifier.sol (자동 생성)
│                        → MockNFTTransferVerifier.sol (테스트용)
└── IGamingItemTradeVerifier → GamingItemTradeVerifier.sol (자동 생성)
                             → MockGamingItemTradeVerifier.sol (테스트용)
```

---

## NFTNoteBase

**파일**: `contracts/NFTNoteBase.sol`

UTXO 스타일의 노트 관리 및 널리파이어(nullifier) 추적 기능을 제공하는 기본 컨트랙트입니다. F1과 F5에서 공통으로 사용됩니다.

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

**실패 조건**: 동일한 gameId/itemId가 이미 등록된 경우 "Item already registered"와 함께 되돌립니다. 동일한 `itemId`라도 `gameId`가 다르면 등록 가능합니다.

#### `tradeItem(a, b, c, oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier, encryptedNote)`

영지식 증명을 사용하여 아이템을 비공개로 거래합니다.

**검증기 공개 입력**: `[oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]`

---

## 검증기 인터페이스 (Verifier Interfaces)

**파일**: `contracts/verifiers/IGroth16Verifier.sol`

두 인터페이스 모두 동일한 시그니처(5개의 공개 입력)를 가집니다.

### 생성된 검증기 (Generated Verifiers)

snarkjs가 기본적으로 `Groth16Verifier`라는 이름을 사용하므로, Hardhat에서는 정규화된 이름(fully qualified name)을 사용해야 합니다.

### 모의 검증기 (Mock Verifiers)

단위 테스트(Hardhat 및 Foundry)를 위해 항상 `true`를 반환하는 모의 검증기를 사용합니다.

---

## 증명 형식 (Proof Format)

snarkjs는 증명을 `{pi_a, pi_b, pi_c}`로 출력하지만, 솔리디티 검증기는 `(uint[2] a, uint[2][2] b, uint[2] c)`를 필요로 합니다. 특히 `b` 좌표의 순서 반전에 주의해야 합니다.

---

## Foundry 테스트

Foundry (Forge) 테스트는 `test/foundry/`에 위치하며 어설션, 이벤트 확인, 퍼즈(fuzz) 테스트를 위해 forge-std를 사용합니다.

### 테스트 패턴

각 테스트 파일은 일관된 구조를 따릅니다:
1. `setUp()`에서 모의 검증기 및 컨트랙트 배포
2. 정상 경로 테스트를 위한 `test_*()`
3. 예외 처리를 위한 `test_RevertWhen_*()`
4. 퍼즈 테스트를 위한 `testFuzz_*()`

### 주요 Forge 기능

- `vm.expectRevert`: 특정 오류 메시지와 함께 되돌아오는지 확인
- `vm.expectEmit`: 이벤트 발생 확인
- `vm.assume`: 유효하지 않은 퍼즈 입력 필터링
- `assertEq`, `assertTrue`: 상태 어설션

---

## 배포 (Deployment)

생성자 파라미터로 각각 배포된 `Groth16Verifier`의 주소를 전달해야 합니다. 배포 순서는 검증기를 먼저 배포한 후 주 컨트랙트를 배포합니다.
