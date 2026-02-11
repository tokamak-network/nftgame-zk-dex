# ZK 회로 아키텍처

## 개요

모든 회로는 **BN128** 타원 곡선 상에서 **Groth16** 증명 시스템을 사용합니다. 각 회로는 비공개 데이터를 노출하지 않고 특정 속성을 증명합니다.

### 공유 유틸리티

| 회로 | 위치 | 용도 |
|---------|----------|---------|
| `ProofOfOwnership` | `utils/babyjubjub/proof_of_ownership.circom` | BabyJubJub 상에서 sk가 pk와 일치함을 증명 |
| `GetPubKey` | `utils/babyjubjub/get_pubkey.circom` | pk = sk * Base8 유도 |
| `ComputeNullifier` | `utils/nullifier.circom` | Poseidon(itemId, salt, sk) 계산 |
| `PoseidonNote` | `utils/poseidon/poseidon_note.circom` | 노트 해싱을 위한 7-입력 Poseidon |
| `PoseidonVRF` | `utils/vrf/poseidon_vrf.circom` | F4/F8을 위한 Poseidon(sk, seed) 기반 VRF |

### 주요 설계 결정

- **Poseidon 해시**: SHA256 대신 사용되어 제약 조건을 약 100배 절감 (해시당 약 30,000개 → 약 300개).
- **BabyJubJub 곡선**: 키 유도 및 소유권 증명을 위한 SNARK 친화적 타원 곡선.
- **소유권 증명(ProofOfOwnership)**: `pk[2]` 배열을 사용하여 pkX/pkY 신호를 분리하지 않고 관리 — `ProofOfOwnership` 및 `ProofOfOwnershipStrict` 템플릿 모두 이 패턴을 따릅니다.
- **삼항 연산자 미지원**: Circom은 `? :` 구문을 지원하지 않으므로, `IsZero()`와 산술 연산(`result <== (1 - flag) * value`)을 통해 조건부 로직을 구현합니다.

---

## F1: 비공개 NFT 전송 (Private NFT Transfer)

**파일**: `circuits/main/private_nft_transfer.circom`

### 목적

NFT 소유권을 타인에게 비공개로 전송하며 다음을 증명합니다:
1. 송신자가 기존 NFT 노트를 소유하고 있음
2. 기존 노트 해시가 커밋된 해시와 일치함
3. 새로운 노트가 수신자를 위해 올바르게 형성됨
4. 널리파이어(Nullifier)가 올바르게 계산됨
5. NFT의 신원(nftId, collectionAddress)이 유지됨

### 노트 구조

```
NFT 노트 = Poseidon(pkX, pkY, nftId, collectionAddress, salt)
         = Poseidon(5개 입력)
```

### 신호 명세 (Signal Specification)

#### 공개 입력 (Public Inputs - 5개)

| # | 신호명 | 타입 | 설명 |
|---|--------|------|-------------|
| 0 | `oldNftHash` | field | 기존 NFT 노트 커밋먼트 |
| 1 | `newNftHash` | field | 새로운 NFT 노트 커밋먼트 |
| 2 | `nftId` | field | NFT 토큰 ID |
| 3 | `collectionAddress` | field | NFT 컬렉션 컨트랙트 주소 |
| 4 | `nullifier` | field | 이중 지불 방지를 위한 널리파이어 |

#### 비공개 입력 (Private Inputs - 7개)

| 신호명 | 설명 |
|--------|-------------|
| `oldOwnerPkX` | 기존 소유자의 BabyJubJub 공개키 X |
| `oldOwnerPkY` | 기존 소유자의 BabyJubJub 공개키 Y |
| `oldOwnerSk` | 기존 소유자의 비밀키 |
| `oldSalt` | 기존 노트의 솔트 |
| `newOwnerPkX` | 새로운 소유자의 BabyJubJub 공개키 X |
| `newOwnerPkY` | 새로운 소유자의 BabyJubJub 공개키 Y |
| `newSalt` | 새로운 노트의 솔트 |

### 제약 조건 분석

| 메트릭 | 수치 |
|--------|-------|
| 비선형 제약 조건 (Non-linear constraints) | 4,862 |
| 선형 제약 조건 (Linear constraints) | 1,542 |
| 전체 와이어 (Total wires) | ~6,400 |
| 템플릿 인스턴스 (Template instances) | ~230 |

### 회로 흐름

```
1. oldNft = Poseidon(oldOwnerPkX, oldOwnerPkY, nftId, collectionAddress, oldSalt)
   → assert: oldNft.out === oldNftHash

2. ownership = ProofOfOwnership(pk=[oldOwnerPkX, oldOwnerPkY], sk=oldOwnerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(nftId, oldSalt, oldOwnerSk)
   → assert: nullifierCalc.out === nullifier

4. newNft = Poseidon(newOwnerPkX, newOwnerPkY, nftId, collectionAddress, newSalt)
   → assert: newNft.out === newNftHash
```

---

## F4: 루트 박스 개봉 (Loot Box Open)

**파일**: `circuits/main/loot_box_open.circom`

### 목적

봉인된 루트 박스를 개봉하고 무작위 아이템 등급을 결정하며 다음을 증명합니다:
1. 소유자가 봉인된 박스 노트를 보유하고 있음
2. VRF 출력이 소유자의 비밀키로부터 올바르게 계산됨
3. 등급(Rarity)이 VRF 출력과 임계값(Thresholds)에 따라 올바르게 결정됨
4. 결과물 노트가 결정된 아이템과 함께 올바르게 형성됨
5. 널리파이어가 중복 개봉을 방지함

### 공유 유틸리티: PoseidonVRF

**파일**: `circuits/utils/vrf/poseidon_vrf.circom`

F4(루트 박스)와 F8(카드 뽑기)에서 재사용 가능한 경량 VRF 컴포넌트입니다:

```
PoseidonVRF(sk, seed) → Poseidon(sk, seed)
```

- **결정적**: 동일한 sk + seed는 항상 같은 출력을 생성
- **예측 불가능**: sk 없이는 출력을 예측할 수 없음
- **효율적**: 약 300개의 제약 조건 (단일 Poseidon 해시)

### 노트 구조

```
박스 노트     = Poseidon(pkX, pkY, boxId, boxType, boxSalt)
               = Poseidon(5개 입력)

결과물 노트   = Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
               = Poseidon(5개 입력)
```

### 신호 명세 (Signal Specification)

#### 공개 입력 (Public Inputs - 5개)

| # | 신호명 | 타입 | 설명 |
|---|--------|------|-------------|
| 0 | `boxCommitment` | field | 봉인된 박스 노트 커밋먼트 |
| 1 | `outcomeCommitment` | field | 결과 아이템 노트 커밋먼트 |
| 2 | `vrfOutput` | field | VRF 출력 (Poseidon(sk, nullifier)) |
| 3 | `boxId` | field | 박스 식별자 |
| 4 | `nullifier` | field | 중복 개봉 방지를 위한 널리파이어 |

#### 비공개 입력 (Private Inputs - 12개)

| 신호명 | 설명 |
|--------|-------------|
| `ownerPkX` | 소유자의 BabyJubJub 공개키 X |
| `ownerPkY` | 소유자의 BabyJubJub 공개키 Y |
| `ownerSk` | 소유자의 비밀키 |
| `boxSalt` | 박스 노트의 솔트 |
| `boxType` | 박스 타입 식별자 |
| `itemId` | 결과 아이템 ID |
| `itemRarity` | 주장하는 희귀도 등급 (0-3) |
| `itemSalt` | 결과물 노트를 위한 솔트 |
| `rarityThresholds[4]` | 누적 확률 임계값 |

### 제약 조건 분석

| 메트릭 | 수치 |
|--------|-------|
| 비선형 제약 조건 | 5,491 |
| 선형 제약 조건 | 1,855 |
| 전체 와이어 | ~7,300 |
| 템플릿 인스턴스 | 234 |

### 회로 흐름

```
1. boxNote = Poseidon(ownerPkX, ownerPkY, boxId, boxType, boxSalt)
   → assert: boxNote.out === boxCommitment

2. ownership = ProofOfOwnership(pk=[ownerPkX, ownerPkY], sk=ownerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(boxId, boxSalt, ownerSk)
   → assert: nullifierCalc.out === nullifier

4. vrf = PoseidonVRF(sk=ownerSk, seed=nullifier)
   → assert: vrf.out === vrfOutput

5. 등급 결정 (Rarity Determination):
   lower14bits = vrfOutput & 0x3FFF  (Num2Bits(254) → Bits2Num(14) 사용)
   vrfMod = lower14bits % 10000      (몫이 0 또는 1임을 보장)
   각 등급 i에 대해: isBelow[i] = LessThan(vrfMod < thresholds[i])
   matched[i] = isBelow[i] AND NOT isBelow[i-1]
   → assert: matched[itemRarity] === 1

6. 임계값 유효성:
   → assert: 임계값이 단조 증가함 (monotonically increasing)
   → assert: thresholds[3] === 10000

7. outcomeNote = Poseidon(ownerPkX, ownerPkY, itemId, itemRarity, itemSalt)
   → assert: outcomeNote.out === outcomeCommitment
```

### 희귀도 로직 상세

14비트 추출을 통해 안전한 필드 산술 연산을 보장합니다:

| 단계 | 연산 | 범위 |
|------|-----------|-------|
| 추출 | `vrfOutput & 0x3FFF` | 0–16383 |
| 나머지 | `lower14bits % 10000` | 0–9999 |
| 몫 | 0 또는 1 (필드 연산에 안전) | 0–1 |

기본 임계값 예시:

| 등급 | 희귀도 | 임계값 | 확률 |
|------|--------|-----------|-------------|
| 0 | Legendary | 100 | 1% |
| 1 | Epic | 500 | 4% |
| 2 | Rare | 2000 | 15% |
| 3 | Common | 10000 | 80% |

---

## F5: 게임 아이템 거래 (Gaming Item Trade)

**파일**: `circuits/main/gaming_item_trade.circom`

### 목적

플레이어 간에 결제 조건(선택 사항)과 함께 게임 아이템을 비공개로 거래하며 다음을 증명합니다:
1. 판매자가 기존 아이템 노트를 소유하고 있음
2. 기존 아이템 노트 해시가 커밋된 해시와 일치함
3. 새로운 아이템 노트가 아이템의 신원(itemId, itemType, itemAttributes)을 유지함
4. 게임 생태계(gameId)가 유지됨
5. 널리파이어가 올바르게 계산됨
6. 지불 노트가 올바르게 형성됨(유료 거래 시) 또는 0임(선물 시)

### 노트 구조

```
아이템 노트 = Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
            = Poseidon(7개 입력)

지불 노트   = Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
            = Poseidon(5개 입력)
```

### 신호 명세 (Signal Specification)

#### 공개 입력 (Public Inputs - 5개)

| # | 신호명 | 타입 | 설명 |
|---|--------|------|-------------|
| 0 | `oldItemHash` | field | 기존 아이템 노트 커밋먼트 |
| 1 | `newItemHash` | field | 새로운 아이템 노트 커밋먼트 |
| 2 | `paymentNoteHash` | field | 지불 노트 커밋먼트 (선물 시 0) |
| 3 | `gameId` | field | 게임 생태계 식별자 |
| 4 | `nullifier` | field | 이중 지불 방지를 위한 널리파이어 |

#### 비공개 입력 (Private Inputs - 13개)

| 신호명 | 설명 |
|--------|-------------|
| `sellerPkX` | 판매자의 BabyJubJub 공개키 X |
| `sellerPkY` | 판매자의 BabyJubJub 공개키 Y |
| `sellerSk` | 판매자의 비밀키 |
| `oldSalt` | 기존 아이템 노트의 솔트 |
| `buyerPkX` | 구매자의 BabyJubJub 공개키 X |
| `buyerPkY` | 구매자의 BabyJubJub 공개키 Y |
| `newSalt` | 새로운 아이템 노트의 솔트 |
| `itemId` | 아이템 토큰 ID |
| `itemType` | 아이템 타입 (무기, 방어구 등) |
| `itemAttributes` | 인코딩된 아이템 능력치/속성 |
| `price` | 결제 금액 (0 = 선물) |
| `paymentToken` | 결제 토큰 타입 |
| `paymentSalt` | 지불 노트를 위한 솔트 |

### 제약 조건 분석

| 메트릭 | 수치 |
|--------|-------|
| 비선형 제약 조건 | 5,309 |
| 선형 제약 조건 | 2,425 |
| 전체 와이어 | 7,747 |
| 템플릿 인스턴스 | 237 |

### 회로 흐름

```
1. oldItem = Poseidon(sellerPkX, sellerPkY, itemId, itemType, itemAttributes, gameId, oldSalt)
   → assert: oldItem.out === oldItemHash

2. ownership = ProofOfOwnership(pk=[sellerPkX, sellerPkY], sk=sellerSk)
   → assert: ownership.valid === 1

3. nullifierCalc = ComputeNullifier(itemId, oldSalt, sellerSk)
   → assert: nullifierCalc.out === nullifier

4. newItem = Poseidon(buyerPkX, buyerPkY, itemId, itemType, itemAttributes, gameId, newSalt)
   → assert: newItem.out === newItemHash

5. paymentNote = Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
   isGift = IsZero(price)
   expectedPaymentHash = (1 - isGift.out) * paymentNote.out
   → assert: paymentNoteHash === expectedPaymentHash
```

### 지불 로직 상세

선물/유료 분기는 조건문 대신 산술 연산을 사용합니다:

| 모드 | price | isGift.out | expectedPaymentHash | paymentNoteHash 필숫값 |
|------|-------|------------|---------------------|------------------------|
| 선물 | 0 | 1 | (1-1) * hash = 0 | 0 |
| 유료 | >0 | 0 | (1-0) * hash = hash | Poseidon(seller, price, token, salt) |

---

## 컴파일 파이프라인

각 회로에 대해 빌드 스크립트(`scripts/compile-circuit.js`)는 다음을 실행합니다:

```
circom <circuit>.circom --r1cs --wasm --sym -o build/
   ↓
snarkjs groth16 setup <circuit>.r1cs <ptau> <circuit>_0.zkey
   ↓
snarkjs zkey contribute <circuit>_0.zkey <circuit>.zkey
   ↓
snarkjs zkey export verificationkey <circuit>.zkey <circuit>_vkey.json
   ↓
snarkjs zkey export solidityverifier <circuit>.zkey <Name>Verifier.sol
   ↓
wasm/zkey/vkey 파일을 frontend/public/circuits/ 로 복사
```

### 빌드 결과물 (Build Artifacts)

```
circuits/build/<circuit_name>/
├── <name>.r1cs              # 제약 조건 시스템
├── <name>.sym               # 심볼 테이블
├── <name>.zkey              # 증명 키 (~10-20 MB)
├── <name>_vkey.json         # 검증 키 (~2 KB)
└── <name>_js/
    └── <name>.wasm          # Witness 생성기 (~1-2 MB)
```
