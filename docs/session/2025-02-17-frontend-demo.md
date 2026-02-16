# Session: Frontend Demo Pages 구현

- **날짜**: 2025-02-17
- **작업 범위**: F1, F4, F5, F8 프론트엔드 데모 페이지 전체 구현
- **상태**: 완료 (TypeScript 빌드 통과, Vite 빌드 성공)

---

## 작업 요약

기존에 "Coming Soon" 카드만 있던 프론트엔드를 실제 ZK 증명 생성 + 온체인 트랜잭션이 가능한 데모 페이지로 전환했다.

### 이전 상태
- `App.tsx`에 지갑 연결 + "Coming Soon" 카드 3개만 있었음
- `useWallet.ts` 훅만 존재
- snarkjs, ethers는 이미 설치되어 있었음

### 이후 상태
- react-router-dom 기반 라우팅
- 4개 데모 페이지 (F1, F4, F5, F8) 각각 전체 플로우
- 브라우저에서 ZK 증명 생성 → 온체인 tx 제출 → 상태 확인까지 가능

---

## 생성/수정된 파일 목록

### 스크립트 (프로젝트 루트)

| 파일 | 설명 |
|------|------|
| `scripts/deploy.js` | 4개 Verifier + 4개 메인 컨트랙트 배포, 주소를 `frontend/src/config/deployedAddresses.json`에 기록 |
| `scripts/copy-frontend-assets.js` | 회로 wasm/zkey를 `frontend/public/circuits/`로 복사 + ABI를 `frontend/src/abi/`로 추출 |

### 프론트엔드 라이브러리 (`frontend/src/lib/`)

| 파일 | 설명 |
|------|------|
| `types.ts` | 공유 타입/상수 (CircuitName, ProofResult, NoteState, 카드 슈트/랭크, 레어리티) |
| `snarkjs.d.ts` | snarkjs 타입 선언 |
| `circomlibjs.d.ts` | circomlibjs 타입 선언 (BabyJub, Poseidon) |
| `crypto.ts` | circomlibBabyJub 브라우저 포팅 (`crypto.getRandomValues()` 사용) |
| `proofGenerator.ts` | snarkjs 래퍼 + `formatProofForContract()` (pi_b 인덱스 스왑) |
| `noteUtils.ts` | F1/F4/F5 노트 해시 계산 + setup 함수 + 증명 생성 |
| `cardUtils.ts` | F8 Fisher-Yates 셔플 + 덱 커밋먼트 + 카드 드로우 |

### 프론트엔드 훅 (`frontend/src/hooks/`)

| 파일 | 설명 |
|------|------|
| `useProofGeneration.ts` | 증명 생성 상태 관리 (isGenerating, elapsed 타이머, error) |
| `useContract.ts` | 컨트랙트 인스턴스 생성 (ABI + 배포 주소 + signer) |

### 프론트엔드 컴포넌트 (`frontend/src/components/`)

| 파일 | 설명 |
|------|------|
| `Layout.tsx` | 사이드바 네비게이션 + 헤더 (지갑 연결) + Router Outlet |
| `StepCard.tsx` | 번호 매긴 스텝 카드 (disabled/active/complete 상태) |
| `ProofStatus.tsx` | ZK 증명 생성 스피너 + 경과 시간 |
| `TxStatus.tsx` | 트랜잭션 해시 + 확인 상태 표시 |

### 프론트엔드 페이지 (`frontend/src/pages/`)

| 파일 | 설명 |
|------|------|
| `HomePage.tsx` | 기능 카드 4개 (라우터 링크) |
| `F1PrivateNFTPage.tsx` | 키페어 생성 → NFT 등록 → 이전 증명 → 이전 실행 |
| `F4LootBoxPage.tsx` | 키페어 생성 → 박스 등록 → 오픈 증명 → 박스 오픈 (레어리티 표시) |
| `F5GamingItemTradePage.tsx` | 아이템 등록 → 거래 설정 (유료/선물) → 증명 → 거래 실행 |
| `F8CardDrawPage.tsx` | 게임 설정 → 덱 등록 → 카드 드로우 반복 (핸드 누적 표시) |

### 수정된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/App.tsx` | BrowserRouter + Routes + Layout 래퍼로 교체 |
| `src/main.tsx` | 변경 없음 (기존 유지) |

### 생성된 에셋 (스크립트로 생성)

| 파일 | 설명 |
|------|------|
| `frontend/src/abi/PrivateNFT.json` | PrivateNFT 컨트랙트 ABI |
| `frontend/src/abi/LootBoxOpen.json` | LootBoxOpen 컨트랙트 ABI |
| `frontend/src/abi/GamingItemTrade.json` | GamingItemTrade 컨트랙트 ABI |
| `frontend/src/abi/CardDraw.json` | CardDraw 컨트랙트 ABI |
| `frontend/public/circuits/*/` | 4개 회로의 wasm + zkey 파일 |
| `frontend/src/config/deployedAddresses.json` | 배포 주소 (deploy.js가 덮어씀) |

### 설치된 의존성

```bash
cd frontend && npm install react-router-dom circomlibjs
```

---

## 라우팅 구조

```
/                  → HomePage (기능 카드 + 링크)
/f1-private-nft    → F1PrivateNFTPage
/f4-loot-box       → F4LootBoxPage
/f5-item-trade     → F5GamingItemTradePage
/f8-card-draw      → F8CardDrawPage
```

---

## 각 데모 페이지 플로우

### F1: Private NFT Transfer
1. NFT ID + Collection Address 입력 → BabyJubJub 키페어 2개 생성 (Owner A, B)
2. `registerNFT(noteHash, collection, nftId, enc)` 호출
3. ZK 증명 생성 (~3-10초)
4. `transferNFT(a,b,c, oldHash, newHash, nftId, collection, nullifier, enc)` 호출
5. 결과: Old Note=Spent, New Note=Valid

### F4: Loot Box Open
1. Box ID + Type + Item ID 입력 → 키페어 생성 + VRF 계산
2. `registerBox(noteHash, boxId, enc)` 호출
3. ZK 증명 생성 (~3-10초)
4. `openBox(a,b,c, box, outcome, vrfOutput, boxId, nullifier, enc)` 호출
5. 결과: 레어리티 표시 (Legendary/Epic/Rare/Common)

### F5: Gaming Item Trade
1. Item 정보 입력 + 유료/선물 토글
2. `registerItem(noteHash, gameId, itemId, enc)` 호출
3. ZK 증명 생성 (~3-10초)
4. `tradeItem(a,b,c, old, new, payment, gameId, nullifier, enc)` 호출
5. 결과: Old=Spent, New=Valid

### F8: Card Draw
1. Game ID 입력 → Fisher-Yates 셔플 + 덱 커밋먼트 계산
2. `registerDeck(deckCommitment, gameId, enc)` 호출
3. 카드 드로우: 증명 생성 (~30초, 99K constraints) → `drawCard(...)` 호출
4. 반복 드로우 가능 (같은 덱, 핸드 누적)

---

## 실행 방법

```bash
# 1. 컨트랙트 컴파일 (이미 되어 있으면 스킵)
npx hardhat compile

# 2. 프론트엔드 에셋 준비 (ABI + 회로 파일 복사)
node scripts/copy-frontend-assets.js

# 3. 로컬 노드 시작
npx hardhat node

# 4. 컨트랙트 배포 (다른 터미널)
npx hardhat run scripts/deploy.js --network localhost

# 5. 프론트엔드 시작
cd frontend && npm run dev
# → http://localhost:3000

# 6. MetaMask 연결 (localhost:8545, chainId 1337)
```

---

## 주요 설계 결정

1. **브라우저 암호화**: `crypto.randomBytes()` → `crypto.getRandomValues()` 변환
2. **증명 생성**: `snarkjs.groth16.fullProve(inputs, wasmUrl, zkeyUrl)` — URL 경로로 wasm/zkey 참조
3. **암호화된 노트**: 실제 ECDH 대신 `"demo"` 바이트 사용 (통합 테스트와 동일)
4. **TypeScript**: `erasableSyntaxOnly: true` — enum 대신 const 객체 + union 타입 사용
5. **Verifier 배포**: fully-qualified path 사용 (4개 모두 `Groth16Verifier`로 이름이 같음)

---

## 알려진 제한사항

- F8 카드 드로우 증명은 ~30초 소요 (99K constraint, 46MB zkey)
- `deployedAddresses.json`이 placeholder 상태면 컨트랙트 호출 실패 → `deploy.js` 실행 필수
- circomlibjs의 Node 모듈 (assert, buffer, events) 관련 Vite 경고는 정상 동작에 영향 없음
