# 테스트 가이드

## 개요

이 프로젝트는 네 가지 수준의 테스트 시스템을 갖추고 있습니다:

| 수준 | 도구 | 블록체인 사용 | ZK 증명 사용 | 속도 |
|-------|------|------------|----------|-------|
| **회로 단위 테스트** | Mocha + snarkjs | 미사용 | 실제 증명 | 보통 (테스트당 약 2초) |
| **컨트랙트 단위(Hardhat)** | Hardhat + Chai | Hardhat EVM | Mock (항상 참) | 빠름 (테스트당 약 50ms) |
| **컨트랙트 단위(Foundry)** | Forge + forge-std | Forge EVM | Mock (항상 참) | 매우 빠름 (테스트당 약 1ms) |
| **통합 테스트** | Hardhat + snarkjs | Hardhat EVM | 실제 증명 | 느림 (테스트당 약 200ms) |

---

## 사전 준비 사항

테스트를 실행하기 전에 다음을 확인하세요:

1. **의존성 설치**: `npm install`
2. **Git 서브모듈 초기화**(Foundry 테스트용):
   ```bash
   git submodule update --init --recursive
   ```
3. **회로 컴파일**(회로 단위 및 통합 테스트용):
   ```bash
   node scripts/compile-circuit.js private_nft_transfer
   node scripts/compile-circuit.js loot_box_open
   node scripts/compile-circuit.js gaming_item_trade
   node scripts/compile-circuit.js card_draw
   ```
4. **컨트랙트 컴파일**: `npx hardhat compile`

> 컨트랙트 단위 테스트(Hardhat mock 및 Foundry)는 회로 컴파일 없이도 실행 가능합니다. 회로 단위 및 통합 테스트는 컴파일된 회로 아티팩트가 필요합니다.

---

## 테스트 실행 방법

### 모든 테스트 일괄 실행

```bash
# 모든 Hardhat 테스트 (컨트랙트 단위 + 통합)
npx hardhat test

# 모든 회로 단위 테스트
npx mocha test/circuits/ --timeout 120000

# 모든 Foundry 테스트
forge test

# 전체 통합 실행
npx hardhat test && npx mocha test/circuits/ --timeout 120000 && forge test
```

### 기능별 실행

#### F1: 비공개 NFT 전송

```bash
# 회로 단위 테스트 (11개 테스트)
npx mocha test/circuits/nft-transfer.test.js --timeout 120000

# 컨트랙트 단위 테스트 - Hardhat mock verifier (4개 테스트)
npx hardhat test test/PrivateNFT.test.js

# 컨트랙트 단위 테스트 - Foundry (퍼즈 포함 14개 테스트)
forge test --match-contract PrivateNFTTest

# 통합 테스트 - 실제 ZK 증명 (9개 테스트)
npx hardhat test test/PrivateNFT.integration.test.js
```

#### F4: 루트 박스 개봉

```bash
# 회로 단위 테스트 (15개 테스트)
npx mocha test/circuits/loot-box-open.test.js --timeout 120000

# 컨트랙트 단위 테스트 - Hardhat mock verifier (9개 테스트)
npx hardhat test test/LootBoxOpen.test.js

# 컨트랙트 단위 테스트 - Foundry (퍼즈 포함 15개 테스트)
forge test --match-contract LootBoxOpenTest

# 통합 테스트 - 실제 ZK 증명 (9개 테스트)
npx hardhat test test/LootBoxOpen.integration.test.js
```

#### F5: 게임 아이템 거래

```bash
# 회로 단위 테스트 (12개 테스트)
npx mocha test/circuits/gaming-item-trade.test.js --timeout 120000

# 컨트랙트 단위 테스트 - Hardhat mock verifier (9개 테스트)
npx hardhat test test/GamingItemTrade.test.js

# 컨트랙트 단위 테스트 - Foundry (퍼즈 포함 17개 테스트)
forge test --match-contract GamingItemTradeTest

# 통합 테스트 - 실제 ZK 증명 (9개 테스트)
npx hardhat test test/GamingItemTrade.integration.test.js
```

#### F8: 카드 뽑기 검증

```bash
# 회로 단위 테스트 (14개 테스트)
npx mocha test/circuits/card-draw.test.js --timeout 300000

# 컨트랙트 단위 테스트 - Hardhat mock verifier (9개 테스트)
npx hardhat test test/CardDraw.test.js

# 컨트랙트 단위 테스트 - Foundry (퍼즈 포함 15개 테스트)
forge test --match-contract CardDrawTest

# 통합 테스트 - 실제 ZK 증명 (8개 테스트)
npx hardhat test test/CardDraw.integration.test.js
```

> 참고: F8 회로 테스트는 대규모 Fisher-Yates 셔플 회로(약 10만 개의 제약 조건)로 인해 더 긴 타임아웃(~300초)이 필요합니다.

---

## 테스트 상세 구성

### F1: 비공개 NFT 전송 (Hardhat/Mocha 24개 + Foundry 14개)

#### 회로 단위 테스트 (`test/circuits/nft-transfer.test.js`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| Valid proof generation & verification | Happy path | 전체 증명 라이프사이클 |
| Correct public signals order | Happy path | 회로 선언과 신호 순서 일치 여부 |
| Different proofs for different transfers | Happy path | 증명의 고유성 |
| Wrong secret key | 보안 | 소유권 검증 |
| Wrong nftId | 보안 | NFT 식별자 보존 |
| Wrong salt | 보안 | 노트 커밋먼트 무결성 |
| Wrong nullifier | 보안 | 널리파이어 계산 |
| Wrong old note hash | 보안 | 커밋먼트 검증 |
| Wrong new note hash | 보안 | 새로운 노트 무결성 |
| Swapped owner keys | 보안 | 키 바인딩 |
| Tampered public signals | 보안 | 증명-신호 바인딩 |

#### 컨트랙트 단위 테스트 (`test/PrivateNFT.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register a new NFT note | 기본적인 노트 생성 |
| Reject duplicate NFT registration | 등록 고유성 |
| Transfer NFT with valid proof (mock) | 모의 검증기를 이용한 전송 흐름 |
| Reject transfer with used nullifier | 이중 지불 방지 |

#### Foundry 테스트 (`test/foundry/PrivateNFT.t.sol`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| test_RegisterNFT | Happy path | 기본적인 노트 생성 및 상태 |
| test_RegisterNFT_EmitsEvent | 이벤트 | 올바른 인자를 가진 NFTRegistered 이벤트 |
| test_RegisterNFT_EmitsNoteCreated | 이벤트 | 기본 컨트랙트의 NoteCreated 이벤트 |
| test_RevertWhen_DuplicateNFTRegistration | 보안 | 동일한 컬렉션/nftId 거절 |
| test_RevertWhen_DuplicateNoteHash | 보안 | 동일한 noteHash 거절 |
| testFuzz_RegisterNFT | 퍼즈 (256회) | 무작위 noteHash/nftId 등록 |
| test_TransferNFT | Happy path | 상태 변경을 포함한 전체 전송 흐름 |
| test_TransferNFT_EmitsEvents | 이벤트 | NoteSpent + NoteCreated + NFTTransferred |
| test_ChainedTransfer | Happy path | A -> B -> C 다단계 전송 |
| test_RevertWhen_DoubleSpend | 보안 | 동일 널리파이어 재사용 차단 |
| test_RevertWhen_SpentNote | 보안 | 이미 소비된 노트 거절 |
| test_RevertWhen_NonExistentNote | 보안 | 존재하지 않는 노트 거절 |
| test_GetNoteState_Invalid | 뷰 | 기본 상태가 Invalid(0)인지 확인 |
| test_IsNullifierUsed_False | 뷰 | 기본 널리파이어가 미사용 상태인지 확인 |

#### 통합 테스트 (`test/PrivateNFT.integration.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register and transfer with real ZK proof | 전체 파이프라인 엔드투엔드 |
| Chained transfers (A -> B -> C) | 다단계 소유권 전송 |
| Reject double-spend (same nullifier) | 온체인 널리파이어 추적 |
| Reject transfer of already-spent note | 노트 상태 관리 |
| Reject transfer of non-existent note | 노트 존재 확인 |
| Reject duplicate NFT registration | 등록 고유성 |
| Reject duplicate note hash | 노트 해시 고유성 |
| Emit NFTRegistered event | 이벤트 발생 |
| Emit NFTTransferred event | 이벤트 발생 |

---

### F4: 루트 박스 개봉 (Hardhat/Mocha 33개 + Foundry 15개)

#### 회로 단위 테스트 (`test/circuits/loot-box-open.test.js`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| Valid loot box open proof | Happy path | 전체 증명 라이프사이클 |
| Correct public signals order | Happy path | 5개 신호 순서 확인 |
| Different box types produce different proofs | Happy path | 박스 타입별 차별화 |
| Same owner different boxes produce different VRF | Happy path | 박스별 VRF 고유성 |
| Wrong secret key | 보안 | 소유권 검증 |
| Wrong boxId | 보안 | 박스 식별자 보존 |
| Wrong nullifier | 보안 | 널리파이어 계산 |
| Wrong vrfOutput | 보안 | VRF 정확성 |
| Wrong itemRarity | 보안 | 희귀도 결정 |
| Wrong outcomeCommitment | 보안 | 결과물 노트 무결성 |
| Invalid thresholds (not ordered) | 보안 | 임계값 단조 증가 여부 |
| Invalid last threshold (not 10000) | 보안 | 임계값 유효성 |
| Tampered public signal (boxCommitment) | 보안 | 증명-신호 바인딩 |
| Tampered public signal (vrfOutput) | 보안 | 증명-신호 바인딩 |
| Tampered public signal (nullifier) | 보안 | 증명-신호 바인딩 |

#### 컨트랙트 단위 테스트 (`test/LootBoxOpen.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register a new box note | boxId를 포함한 기본 노트 생성 |
| Reject duplicate box registration | 등록 고유성 |
| Reject duplicate note hash | 노트 해시 고유성 |
| Emit BoxRegistered event | 올바른 인자를 가진 이벤트 발생 |
| Open box with valid proof (mock) | 모의 검증기를 이용한 개봉 흐름 |
| Reject double-open (same nullifier) | 중복 개봉 방지 |
| Reject opening already-spent box | 노트 상태 관리 |
| Reject opening non-existent box | 노트 존재 확인 |
| Emit BoxOpened event | 올바른 인자를 가진 이벤트 발생 |

#### Foundry 테스트 (`test/foundry/LootBoxOpen.t.sol`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| test_RegisterBox | Happy path | 기본 박스 노트 생성 |
| test_RegisterBox_EmitsEvent | 이벤트 | 올바른 인자를 가진 BoxRegistered 이벤트 |
| test_RegisterBox_EmitsNoteCreated | 이벤트 | 기본 컨트랙트의 NoteCreated 이벤트 |
| test_RevertWhen_DuplicateBoxRegistration | 보안 | 동일 boxId 거절 |
| test_RevertWhen_DuplicateNoteHash | 보안 | 동일 noteHash 거절 |
| testFuzz_RegisterBox | 퍼즈 (256회) | 무작위 noteHash/boxId 등록 |
| test_OpenBox | Happy path | 상태 변경을 포함한 전체 개봉 흐름 |
| test_OpenBox_EmitsEvents | 이벤트 | NoteSpent + NoteCreated + BoxOpened |
| test_OpenMultipleBoxes | Happy path | 여러 박스 순차 개봉 |
| test_RevertWhen_DoubleOpen | 보안 | 동일 널리파이어 재사용 차단 |
| test_RevertWhen_SpentBox | 보안 | 이미 소비된 박스 거절 |
| test_RevertWhen_NonExistentBox | 보안 | 존재하지 않는 박스 거절 |
| test_GetNoteState_Invalid | 뷰 | 기본 상태 확인 |
| test_IsNullifierUsed_False | 뷰 | 기본 널리파이어 상태 확인 |
| testFuzz_OpenBox | 퍼즈 (256회) | 무작위 값을 통한 전체 개봉 흐름 |

#### 통합 테스트 (`test/LootBoxOpen.integration.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register and open box with real ZK proof | 전체 파이프라인 엔드투엔드 |
| Open box with different box type | 박스 타입 파라미터 지원 |
| Open multiple boxes from same owner | 다중 박스 소유권 |
| Reject double-open (same nullifier) | 온체인 널리파이어 추적 |
| Reject opening already-spent box | 노트 상태 관리 |
| Reject duplicate box registration | 등록 고유성 |
| Reject duplicate note hash | 노트 해시 고유성 |
| Emit BoxRegistered event | 이벤트 발생 |
| Emit BoxOpened event | 이벤트 발생 |

---

### F5: 게임 아이템 거래 (Hardhat/Mocha 30개 + Foundry 17개)

#### 회로 단위 테스트 (`test/circuits/gaming-item-trade.test.js`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| Valid paid trade proof | Happy path | 유료 거래(price > 0) 전체 라이프사이클 |
| Valid gift (price=0) proof | Happy path | paymentNoteHash = 0인 무료 전송 |
| Correct public signals order | Happy path | 5개 신호 순서 확인 |
| Wrong secret key | 보안 | 소유권 검증 |
| Wrong itemId | 보안 | 아이템 식별자 보존 |
| Wrong gameId | 보안 | 게임 생태계 격리 |
| Wrong nullifier | 보안 | 널리파이어 계산 |
| Tampered itemAttributes | 보안 | 속성 보존 |
| Wrong payment hash (wrong price) | 보안 | 결제 무결성 |
| Gift with non-zero paymentNoteHash | 보안 | 선물/유료 모드 정확성 |
| Tampered public signals (gameId) | 보안 | 증명-신호 바인딩 |
| Tampered public signals (nullifier) | 보안 | 증명-신호 바인딩 |

#### 컨트랙트 단위 테스트 (`test/GamingItemTrade.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register a new item note | gameId/itemId를 포함한 기본 노트 생성 |
| Reject duplicate item registration | 게임별 등록 고유성 |
| Allow same itemId in different games | 게임 생태계 격리 |
| Emit ItemRegistered event | 올바른 인자를 가진 이벤트 발생 |
| Trade item with valid proof (mock) | 전송 흐름 검증 |
| Trade item as gift (paymentNoteHash = 0) | 선물 모드 지원 |
| Reject transfer with used nullifier | 이중 지불 방지 |
| Reject trade of non-existent note | 노트 존재 확인 |
| Emit ItemTraded event | 올바른 인자를 가진 이벤트 발생 |

#### Foundry 테스트 (`test/foundry/GamingItemTrade.t.sol`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| test_RegisterItem | Happy path | 기본 아이템 노트 생성 |
| test_RegisterItem_EmitsEvent | 이벤트 | 올바른 인자를 가진 ItemRegistered 이벤트 |
| test_RegisterItem_EmitsNoteCreated | 이벤트 | 기본 컨트랙트의 NoteCreated 이벤트 |
| test_RevertWhen_DuplicateItemRegistration | 보안 | 동일 gameId/itemId 거절 |
| test_RevertWhen_DuplicateNoteHash | 보안 | 동일 noteHash 거절 |
| test_SameItemIdDifferentGames | 격리 | 다른 게임에서 동일 itemId 허용 |
| testFuzz_RegisterItem | 퍼즈 (256회) | 무작위 등록 검증 |
| test_TradeItem_Paid | Happy path | 모의 검증기를 이용한 유료 거래 |
| test_TradeItem_Gift | Happy path | 선물 거래 (paymentHash = 0) |
| test_TradeItem_EmitsEvents | 이벤트 | NoteSpent + NoteCreated + ItemTraded |
| test_ChainedTrade | Happy path | A -> B -> C 다단계 거래 |
| test_RevertWhen_DoubleSpend | 보안 | 동일 널리파이어 재사용 차단 |
| test_RevertWhen_SpentNote | 보안 | 이미 소비된 노트 거절 |
| test_RevertWhen_NonExistentNote | 보안 | 존재하지 않는 노트 거절 |
| test_GetNoteState_Invalid | 뷰 | 기본 상태 확인 |
| test_IsNullifierUsed_False | 뷰 | 기본 널리파이어 상태 확인 |
| testFuzz_TradeItem | 퍼즈 (256회) | 무작위 전체 거래 흐름 |

#### 통합 테스트 (`test/GamingItemTrade.integration.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register and trade with real ZK proof (paid) | 유료 거래 전체 파이프라인 |
| Register and trade as gift (price=0) | 선물 거래 전체 파이프라인 |
| Chained trades (A -> B -> C) | 다단계 아이템 전송 |
| Reject double-spend (same nullifier) | 온체인 널리파이어 추적 |
| Reject trade of already-spent note | 노트 상태 관리 |
| Reject duplicate item registration | 등록 고유성 |
| Reject duplicate note hash | 노트 해시 고유성 |
| Emit ItemRegistered event | 이벤트 발생 |
| Emit ItemTraded event | 이벤트 발생 |

---

### F8: 카드 뽑기 검증 (Hardhat/Mocha 31개 + Foundry 15개)

#### 회로 단위 테스트 (`test/circuits/card-draw.test.js`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| Valid card draw proof | Happy path | Fisher-Yates 셔플을 포함한 전체 증명 라이프사이클 |
| Correct public signals order | Happy path | 5개 신호 순서 확인 |
| Different draw indices | Happy path | 0이 아닌 인덱스(25)에서의 드로우 |
| Different seeds produce different shuffles | Happy path | 시드별 셔플 고유성 |
| Wrong secret key | 보안 | 소유권 검증 |
| Wrong shuffleSeed | 보안 | 셔플 무결성 (덱 불일치) |
| Wrong drawnCard | 보안 | 카드-인덱스 바인딩 |
| Wrong drawIndex | 보안 | 인덱스-카드 바인딩 |
| Wrong gameId | 보안 | 게임 세션 격리 |
| Wrong deckCommitment | 보안 | 덱 커밋먼트 무결성 |
| Wrong drawCommitment | 보안 | 드로우 커밋먼트 무결성 |
| Tampered public signal (deckCommitment) | 보안 | 증명-신호 바인딩 |
| Tampered public signal (drawCommitment) | 보안 | 증명-신호 바인딩 |
| Tampered public signal (playerCommitment) | 보안 | 증명-신호 바인딩 |

#### 컨트랙트 단위 테스트 (`test/CardDraw.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register a new deck | gameId를 포함한 기본 덱 등록 |
| Reject duplicate game registration | 게임별 등록 고유성 |
| Reject duplicate note hash | 노트 해시 고유성 |
| Emit DeckRegistered event | 올바른 인자를 가진 이벤트 발생 |
| Draw card with valid proof (mock) | 모의 검증기를 이용한 드로우 흐름, 덱은 Valid 유지 |
| Reject duplicate drawIndex (same game) | 중복 드로우 방지 |
| Allow multiple draws at different indices | 영속적 덱에서 다중 드로우 허용 |
| Reject draw for unregistered game | 게임 등록 여부 확인 |
| Emit CardDrawn event | 올바른 인자를 가진 이벤트 발생 |

#### Foundry 테스트 (`test/foundry/CardDraw.t.sol`)

| 테스트 | 카테고리 | 검증 내용 |
|------|----------|-----------------|
| test_RegisterDeck | Happy path | 기본 덱 노트 생성 |
| test_RegisterDeck_EmitsEvent | 이벤트 | 올바른 인자를 가진 DeckRegistered 이벤트 |
| test_RegisterDeck_EmitsNoteCreated | 이벤트 | 기본 컨트랙트의 NoteCreated 이벤트 |
| test_RevertWhen_DuplicateGameRegistration | 보안 | 동일 gameId 거절 |
| test_RevertWhen_DuplicateNoteHash | 보안 | 동일 noteHash 거절 |
| testFuzz_RegisterDeck | 퍼즈 (256회) | 무작위 덱 등록 검증 |
| test_DrawCard | Happy path | 전체 드로우 흐름, 덱은 Valid 유지 |
| test_DrawCard_EmitsEvents | 이벤트 | NoteCreated + CardDrawn |
| test_DrawMultipleCards | Happy path | 인덱스 0, 1, 2에서 3회 연속 드로우 |
| test_RevertWhen_DuplicateDrawIndex | 보안 | 동일 drawIndex 재사용 차단 |
| test_RevertWhen_UnregisteredGame | 보안 | 존재하지 않는 게임 거절 |
| test_RevertWhen_WrongDeckCommitment | 보안 | 잘못된 덱 해시 거절 |
| test_GetNoteState_Invalid | 뷰 | 기본 상태 확인 |
| test_DrawnCards_False | 뷰 | 기본 드로우 상태 확인 |
| testFuzz_DrawCard | 퍼즈 (256회) | 무작위 전체 드로우 흐름 |

#### 통합 테스트 (`test/CardDraw.integration.test.js`)

| 테스트 | 검증 내용 |
|------|-----------------|
| Register deck and draw card with real ZK proof | 전체 파이프라인 엔드투엔드 |
| Draw at different index (10) | 0이 아닌 인덱스 지원 |
| Multiple draws from same deck | 동일 deckSalt/shuffleSeed를 사용한 다중 드로우 |
| Reject duplicate drawIndex | 온체인 drawIndex 추적 |
| Reject duplicate deck registration | 등록 고유성 |
| Reject duplicate note hash registration | 노트 해시 고유성 |
| Emit DeckRegistered event | 이벤트 발생 |
| Emit CardDrawn event | 이벤트 발생 |

---

## Foundry 테스트

### 개요

Foundry (Forge) 테스트는 내장된 퍼즈 테스트 지원과 함께 빠르고 솔리디티 네이티브한 컨트랙트 테스트를 제공합니다. Hardhat 테스트를 보완하며 다음과 같은 장점이 있습니다:

- **속도**: Hardhat의 수 초 대비 전체 실행에 약 100ms 소요
- **퍼즈 테스트**: 자동으로 무작위 입력을 생성 (퍼즈 테스트당 256회 실행)
- **네이티브 솔리디티**: 컨트랙트 언어와 동일한 솔리디티로 테스트 작성
- **가스 보고**: 테스트별 가스 측정 결과 내장

### 설정

| 파일 | 용도 |
|------|---------|
| `foundry.toml` | Forge 설정 (소스, 테스트 디렉토리, solc 버전, 퍼즈 횟수 등) |
| `remappings.txt` | 임포트 경로 매핑 (`forge-std/`) |
| `.gitmodules` | forge-std 서브모듈 참조 |

### 실행 방법

```bash
# 모든 Foundry 테스트 실행
forge test

# 테스트 이름을 포함하여 상세 실행
forge test -vv

# 가스 보고서 포함
forge test --gas-report

# 특정 컨트랙트만 실행
forge test --match-contract PrivateNFTTest
forge test --match-contract LootBoxOpenTest
forge test --match-contract GamingItemTradeTest

# 특정 테스트만 실행
forge test --match-test test_TradeItem_Gift

# 퍼즈 횟수 늘리기
forge test --fuzz-runs 1024
```

### 퍼즈 테스트 상세

퍼즈 테스트는 `vm.assume()`을 사용하여 유효하지 않은 입력을 필터링하며 기본적으로 256회 반복 실행됩니다:

| 테스트 | 컨트랙트 | 퍼즈 파라미터 | 검증 내용 |
|------|----------|-----------------|-------------------|
| `testFuzz_RegisterNFT` | PrivateNFT | noteHash, nftId | 유효한 입력에 대해 등록이 항상 작동함 |
| `testFuzz_RegisterBox` | LootBoxOpen | noteHash, boxId | 유효한 입력에 대해 등록이 항상 작동함 |
| `testFuzz_OpenBox` | LootBoxOpen | boxHash, outcomeHash, vrfOutput, nullifier, boxId | 무작위 값에 대한 전체 개봉 흐름 |
| `testFuzz_RegisterItem` | GamingItemTrade | noteHash, gameId, itemId | 유효한 입력에 대해 등록이 항상 작동함 |
| `testFuzz_TradeItem` | GamingItemTrade | oldHash, newHash, paymentHash, nullifier, itemId | 무작위 값에 대한 전체 거래 흐름 |
| `testFuzz_RegisterDeck` | CardDraw | deckCommitment, gameId | 유효한 입력에 대해 등록이 항상 작동함 |
| `testFuzz_DrawCard` | CardDraw | deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment | 무작위 값에 대한 전체 드로우 흐름 |

---

## 문제 해결 (Troubleshooting)

### "zkey not found" — 회로 테스트 스킵

회로 단위 테스트 및 통합 테스트는 컴파일된 회로 아티팩트가 필요합니다. 만약 다음과 같은 메시지가 보인다면:

```
⚠️  Skipping circuit tests: zkey not found
```

회로 컴파일을 실행하세요:
```bash
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js loot_box_open
node scripts/compile-circuit.js gaming_item_trade
node scripts/compile-circuit.js card_draw    # 약 5-10분 소요 (10만 제약 조건)
```

### "HH701: Artifact not found" — 검증기 컨트랙트 컴파일 미비

통합 테스트가 아티팩트 오류로 실패한다면, 솔리디티 검증기가 컴파일되지 않은 것입니다:
```bash
npx hardhat compile
```

### 회로 테스트 타임아웃 오류

회로 증명 생성은 느릴 수 있습니다. 타임아웃 시간을 늘리세요:
```bash
npx mocha test/circuits/ --timeout 300000
```

### 네 개의 Groth16Verifier 컨트랙트

F1, F4, F5, F8은 각각 `Groth16Verifier`라는 이름의 솔리디티 검증기를 생성합니다. Hardhat은 정규화된 이름(fully qualified names)으로 이를 처리합니다. 코드 예시:
```javascript
// 모호성을 피하기 위해 전체 경로 사용
const Verifier = await ethers.getContractFactory(
  "contracts/verifiers/LootBoxOpenVerifier.sol:Groth16Verifier"
);
```

### Foundry: "forge-std not found"

Forge가 `forge-std`를 찾지 못한다면 git 서브모듈을 초기화하세요:
```bash
git submodule update --init --recursive
```

### Foundry: 첫 빌드 시 캐시 오류

첫 `forge build` 시 `invalid type: sequence, expected a map`과 같은 메시지가 보일 수 있으나, 이는 무해한 캐시 경고이며 컴파일은 성공합니다.
