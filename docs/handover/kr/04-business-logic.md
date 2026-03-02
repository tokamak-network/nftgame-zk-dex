# 4. 핵심 비즈니스 로직

[< 목차로 돌아가기](./README.md)

---

## 4.1 UTXO Note 시스템 (모든 기능의 핵심)

모든 기능은 **UTXO 스타일의 Note 시스템** 위에 구축된다. 이 시스템을 이해하지 못하면 나머지 코드를 이해할 수 없다.

### Note 생명주기

```
Invalid (존재하지 않음)
  → Valid (생성됨, 사용 가능)
    → Spent (소비됨, 재사용 불가)
```

### Double-Spend 방지 (Nullifier)

```
Nullifier = Poseidon(itemId, salt, secretKey)
→ 한번 사용된 Nullifier는 온체인 mapping에 영구 기록
→ 동일 Note를 두 번 사용하려 하면 트랜잭션 revert
```

### NFTNoteBase.sol (기반 컨트랙트)

모든 피처 컨트랙트가 이 컨트랙트를 상속한다.

| 상태 변수 | 타입 | 설명 |
|---|---|---|
| `notes` | `mapping(bytes32 => NoteState)` | Note 해시 → 상태 (Invalid/Valid/Spent) |
| `nullifiers` | `mapping(bytes32 => bool)` | 사용된 Nullifier 기록 |
| `encryptedNotes` | `mapping(bytes32 => bytes)` | ECDH 암호화된 Note 데이터 |

| 함수 | 설명 |
|---|---|
| `_createNote(noteHash, encryptedNote)` | Note를 Valid 상태로 생성 |
| `_spendNote(noteHash, nullifier)` | Note를 Spent으로 변경 + Nullifier 기록 |
| `noteExists(noteHash)` modifier | Note가 Valid인지 확인 |
| `nullifierNotUsed(nullifier)` modifier | Nullifier 미사용 확인 |

---

## 4.2 F1: Private NFT Transfer

### 플로우 다이어그램

```
                    프론트엔드 (브라우저)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   1. registerNFT   2. ZK 증명 생성   3. transferNFT
   (NFT 등록)       (snarkjs)         (전송 실행)
        │                │                │
        ▼                ▼                ▼
   PrivateNFT.sol   Circom 회로    PrivateNFT.sol
   - Note 생성       - 소유권 증명    - 구 Note 소비
   - 암호화 저장     - Nullifier 계산 - 신 Note 생성
                     - 신 Note 형성   - 검증자 호출
```

### 상세 흐름

1. **사용자 A가 NFT 등록**: `registerNFT(noteHash, collection, nftId, encryptedNote)`
   - Note 해시 = `Poseidon(A.pkX, A.pkY, nftId, collectionAddress, salt)`
   - 온체인: Note 상태 → Valid, NFT 등록 기록

2. **사용자 A → 사용자 B 전송**: 브라우저에서 ZK 증명 생성 후 `transferNFT()` 호출
   - `oldNftHash = Poseidon(A.pkX, A.pkY, nftId, collection, oldSalt)`
   - `newNftHash = Poseidon(B.pkX, B.pkY, nftId, collection, newSalt)`
   - `nullifier = Poseidon(nftId, oldSalt, A.sk)`
   - ZK 증명이 증명하는 것:
     - A가 비밀키를 알고 있음 (소유권)
     - oldNftHash가 올바르게 계산됨
     - newNftHash가 올바르게 계산됨
     - nullifier가 올바르게 계산됨
     - nftId와 collectionAddress가 보존됨

3. **온체인 검증**: Groth16 검증자가 증명 확인 → 구 Note 소비 + 신 Note 생성

---

## 4.3 F4: Loot Box Open

### 플로우 다이어그램

```
  1. mintBox()          2. registerBox()        3. openBox()
  (ERC20 결제)          (Note 등록)             (ZK 증명 + 개봉)
       │                     │                       │
       ▼                     ▼                       ▼
  TON 토큰 전송          Box Note 생성          Poseidon VRF로 결과 결정
  Box ID 발급            암호화 저장             rarityTier 검증
  소유자 기록                                    Box Note 소비
                                                 Outcome Note 생성
```

### VRF 기반 랜덤 드롭

```
vrfOutput = Poseidon(secretKey, nullifier)
rarity = vrfOutput % 10000

희귀도 임계값 (누적):
  [100, 500, 2000, 10000]
  → 0~99:     Legendary (1%)
  → 100~499:  Epic      (4%)
  → 500~1999: Rare      (15%)
  → 2000~9999:Common    (80%)
```

**핵심 보장:**
- VRF 출력은 비밀키에 의존 → 외부에서 예측 불가
- VRF 출력은 결정적 → 같은 입력이면 같은 결과
- ZK 증명이 VRF 계산의 정확성을 검증
- 임계값은 누적이며 마지막 값은 반드시 10000 (ZK 회로에서 강제)

---

## 4.4 F5: Gaming Item Trade

### 플로우 다이어그램

```
  Seller                                              Buyer
    │                                                   │
    │ 1. registerItem(noteHash, gameId, itemId)         │
    │ 2. listItem(noteHash, gameId, itemId, price)      │
    │                                                   │
    │ ◄──────── 3. purchaseItem(listingId, buyerPk) ────┤
    │              (ERC20 에스크로 입금)                  │
    │                                                   │
    │ 4. executeTradeForBuyer(ZK proof)                 │
    │    - 구 Note 소비                                  │
    │    - 신 Note 생성 (Buyer 소유)                     │
    │    - 에스크로 금액 Seller에게 전송                   │
    │                                                   │
    ▼                                                   ▼
  TON 수령                                    아이템 Note 수령
```

### 핵심 보장 (ZK 회로가 검증)

| 보장 항목 | 설명 |
|---|---|
| 아이템 속성 보존 | `itemId`, `itemType`, `itemAttributes`가 전송 전후 동일 |
| 게임 생태계 격리 | `gameId`가 보존되어 다른 게임으로 아이템 이동 불가 |
| 판매자 소유권 | 판매자가 비밀키를 알고 있음을 증명 |
| 결제 정확성 | price > 0이면 paymentNoteHash 검증, price = 0이면 무료 선물 |

---

## 4.5 F8: Card Draw Verify

### 플로우 다이어그램

```
  1. registerDeck(deckCommitment, gameId)
     → 52장 셔플된 덱의 커미트먼트 등록
     → 덱은 "Persistent" (소비되지 않음)

  2. drawCard(ZK proof, drawIndex)
     → Fisher-Yates 셔플이 올바른지 검증
     → deck[drawIndex]가 올바른 카드임을 증명
     → drawIndex 중복 사용 방지 (on-chain mapping)
```

### Fisher-Yates 셔플 (ZK 회로 내부)

```
for step = 0 to 50:
    i = 51 - step
    r = Poseidon(seed, step)       # 결정적 랜덤
    j = extract14bits(r) % (i + 1) # 스왑 대상
    swap(deck[i], deck[j])         # 멀티플렉서 기반 스왑
```

- ~99,000개 제약조건 (가장 무거운 회로)
- 덱 커미트먼트 = 재귀 Poseidon 체인: `h[i] = Poseidon(h[i-1], cards[i+1])`

### F8과 F1의 차이점

| 항목 | F1 (NFT Transfer) | F8 (Card Draw) |
|---|---|---|
| Note 소비 | 전송 시 구 Note 소비 | 덱 Note는 소비되지 않음 (Persistent) |
| 중복 방지 | Nullifier | drawIndex 매핑 (`drawnCards[gameId][drawIndex]`) |
| 용도 | 1회성 전송 | 같은 덱에서 여러 장 드로우 |

---

## 4.6 F9: Card Draw Game (멀티플레이어)

### 게임 흐름 (4단계)

```
  Phase 1: Open (커밋)
  ┌─────────────────────────────────────────────────────────────┐
  │ Player A: joinGame(deckCommitment, playerCommitment) + 참가비│
  │ Player B: joinGame(deckCommitment, playerCommitment) + 참가비│
  │ (최대 5명, 최소 2명)                                         │
  └──────────────────────┬──────────────────────────────────────┘
                         │ commitTimeout 경과
                         ▼
  Phase 1.5: PendingReveal
  ┌─────────────────────────────────────────────────────────────┐
  │ startReveal() → revealBlock = block.number + 2              │
  │ (아직 존재하지 않는 블록 → blockhash 예측 불가)                │
  └──────────────────────┬──────────────────────────────────────┘
                         │ 블록 채굴 후
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
                         │ 전원 공개 또는 타임아웃 (120초)
                         ▼
  Phase 3: Finished
  ┌─────────────────────────────────────────────────────────────┐
  │ closeGame() → 가장 높은 카드 = 승리                          │
  │ 상금 = 참가비 합계 × 90% (10% 수수료)                        │
  │ 미공개 플레이어는 참가비 몰수 → accumulatedFees              │
  └─────────────────────────────────────────────────────────────┘
```

### 카드 점수 계산

```
점수 = rankValue × 4 + (3 - suitIndex)

Rank: A=14, K=13, Q=12, J=11, 10~2
Suit: Spades(0) > Hearts(1) > Diamonds(2) > Clubs(3)

예시: A♠ = 14×4 + 3 = 59 (최고), 2♣ = 2×4 + 0 = 8 (최저)
```

### 랜덤성 보장 메커니즘

| 단계 | 공격 시도 | 방어 |
|---|---|---|
| 커밋 시 | drawIndex를 미리 계산해서 유리한 덱 제출 | drawIndex는 커밋 이후에 결정됨 |
| startReveal 시 | blockhash를 예측 | revealBlock = block.number + 2 (아직 미채굴) |
| finalizeReveal 시 | Validator가 블록 조작 | prevrandao + blockhash 이중 랜덤 |

### 상수값

| 상수 | 값 | 설명 |
|---|---|---|
| `MAX_PLAYERS` | 5 | 게임당 최대 인원 |
| `MIN_PLAYERS` | 2 | 게임 시작 최소 인원 |
| `FEE_PERCENT` | 10 | 상금 수수료 10% |
| `REVEAL_TIMEOUT` | 120초 | 카드 공개 제한시간 |
