# 10. 향후 개선 + 온보딩 가이드

[< 목차로 돌아가기](./README.md)

---

## Part A: 향후 개선 로드맵

### 단기 (1~2주)

| 우선순위 | 항목 | 설명 |
|---|---|---|
| P0 | 접근 제어 검증 및 수정 | `LootBoxOpen`, `GamingItemTrade` admin 함수 접근 제어 확인/수정 |
| P0 | SafeERC20 적용 | OpenZeppelin `SafeERC20` 라이브러리 사용으로 전환 |
| P1 | .env 환경 변수 도입 | `hardhat.config.js`, `deploy.js`에 `dotenv` 적용 |
| P1 | CI/CD 구축 | GitHub Actions: lint → compile → test (hardhat + forge + circuit) |
| P2 | Docker 환경 구성 | Dockerfile + docker-compose (Node.js + Circom + Hardhat) |

### 중기 (1~2개월)

| 우선순위 | 항목 | 설명 |
|---|---|---|
| P0 | 외부 보안 감사 | ZK 회로 + 스마트 컨트랙트 전문 감사 의뢰 |
| P0 | Phase 2 다자간 세레모니 | 프로덕션용 Groth16 Phase 2 trusted setup |
| P1 | 테스트넷 배포 | Sepolia 등 테스트 네트워크 배포 및 테스트 |
| P1 | 프록시 패턴 도입 | Transparent Proxy 또는 UUPS로 업그레이드 가능 구조 |
| P2 | Note 암호화 저장 | localStorage → IndexedDB + 암호화 |
| P2 | 증명 생성 최적화 | Web Worker + WASM 멀티스레드 최적화 |

### 장기 (3개월+)

| 우선순위 | 항목 | 설명 |
|---|---|---|
| **P0** | **TON Staking 연동 (LotteryCandidate)** | **아래 상세 참조** |
| P1 | 메인넷 배포 | L2 (Optimism/Base/Arbitrum) 또는 EVM 호환 체인 |
| P1 | Subgraph 인덱싱 | The Graph 기반 이벤트 인덱싱 (Note 추적 개선) |
| P2 | 추가 피처 (F2, F3, F6, F7) | 설계 문서에 기반한 미구현 피처 개발 |
| P2 | 모바일 지원 | WalletConnect 통합 + 모바일 반응형 |
| P3 | 서버 사이드 증명 생성 | 모바일/저사양 기기용 서버 사이드 프루버 |

---

### TON Staking 연동 — LotteryCandidate 기반 게임 참가 자격 시스템

> **참조 레포:** https://github.com/tokamak-network/ton-staking-v2/tree/lotteryCandidate

#### 목적

TON Staking V3의 LotteryCandidate 메커니즘을 본 프로젝트에 적용하여, **TON을 스테이킹한 사용자만 게임(F9 Card Draw Game 등)에 참여할 수 있도록** 접근 제어를 추가한다.

#### 배경: ton-staking-v2 (lotteryCandidate 브랜치)

| 항목 | 설명 |
|---|---|
| 프로젝트 | Tokamak Network V3 스테이킹 시스템 (Tokamak Economics Whitepaper V2, 2025.12 기반) |
| 핵심 구조 | L1 Ethereum에서 TON 스테이킹 → L2 (Titan/Thanos) 시퀀서 보상 분배 |
| 스테이킹 방식 | `DepositManagerV1_2`를 통해 TON/WTON 스테이킹 → Coinage 토큰 수령 |
| 참여 자격 | 스테이킹 비율 조건: `S_i >= θ * B_i` (스테이킹량 >= 임계비율 * Bridged TON) |
| 보상 함수 | 쌍곡선 포화 함수: `y(x) = L * (x / (k + x))` |
| 주요 컨트랙트 | `SeigManagerV1_4`, `DepositManagerV1_2`, `Layer2ManagerV1_2`, `RAT`, `ValidatorRewardV1` |

#### 구현 방향

```
┌─────────────────────────────────────────────────────────┐
│                  현재 구조 (변경 전)                       │
│                                                          │
│  User → MetaMask 연결 → 바로 게임 참여 가능               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  목표 구조 (변경 후)                       │
│                                                          │
│  User → MetaMask 연결                                    │
│       → TON Staking 상태 확인 (on-chain query)           │
│       → 최소 스테이킹 조건 충족 여부 검증                   │
│       → 조건 충족 시에만 게임 참여 허용                     │
└─────────────────────────────────────────────────────────┘
```

#### 구현 태스크

| # | 태스크 | 설명 |
|---|---|---|
| 1 | **스테이킹 검증 컨트랙트 작성** | `DepositManagerV1_2` 또는 Coinage 컨트랙트를 조회하여 사용자의 스테이킹 잔액을 확인하는 인터페이스/어댑터 컨트랙트 개발 |
| 2 | **게임 컨트랙트 접근 제어 추가** | `CardDrawGame.joinGame()` 등에 `require(stakingBalance >= minStake)` 조건 추가. 최소 스테이킹 금액은 설정 가능하게 구현 |
| 3 | **프론트엔드 스테이킹 상태 표시** | 게임 참가 화면에서 사용자의 TON 스테이킹 현황을 표시하고, 미충족 시 스테이킹 안내 UI 제공 |
| 4 | **크로스체인 고려** | 본 프로젝트가 L2에 배포될 경우, L1 스테이킹 상태를 L2에서 확인하는 브릿지/오라클 메커니즘 설계 필요 |
| 5 | **테스트** | Mock 스테이킹 컨트랙트로 단위 테스트 + ton-staking-v2 포크 환경에서 통합 테스트 |

#### 영향 범위

| 파일/영역 | 변경 내용 |
|---|---|
| `contracts/CardDrawGame.sol` | `joinGame()`에 스테이킹 검증 로직 추가 |
| `contracts/` (신규) | 스테이킹 검증 인터페이스/어댑터 컨트랙트 |
| `frontend/src/pages/CardDrawGamePage.tsx` | 스테이킹 상태 조회 + 조건 미충족 시 안내 UI |
| `frontend/src/lib/contracts.ts` | 스테이킹 컨트랙트 ABI/주소 추가 |
| `scripts/deploy.js` | 스테이킹 검증 컨트랙트 배포 추가 |
| `test/` | 스테이킹 조건 검증 테스트 추가 |

#### 확인 필요 사항

| 항목 | 질문 |
|---|---|
| 적용 범위 | F9(CardDrawGame)만 적용할지, F4/F5 등 다른 피처에도 적용할지 |
| 최소 스테이킹 금액 | 게임 참여를 위한 최소 TON 스테이킹 수량 기준 |
| 배포 네트워크 | 동일 L1에 배포할지, L2에 배포 시 크로스체인 검증이 필요한지 |
| LotteryCandidate 특정 로직 | lotteryCandidate 브랜치의 로터리 선정 메커니즘을 게임 매칭에도 활용할지 |

---

## Part B: 온보딩 체크리스트 (7일)

### Day 1~2: 환경 설정 + 개념 파악

- [ ] [07-배포 및 운영](./07-deployment-ops.md) 참조하여 환경 설치
- [ ] `npx hardhat node` → `deploy:local` → `frontend dev` 로컬 실행 확인
- [ ] MetaMask 연결 후 프론트엔드 전 기능 클릭해보기
- [ ] [01-프로젝트 개요](./01-project-overview.md) 정독
- [ ] ZK-SNARK 기본 개념 학습:
  - Groth16 증명 시스템
  - Poseidon 해시 함수
  - BabyJubJub 타원곡선
  - UTXO Note 시스템 (Nullifier, Commitment)
- [ ] 프로젝트 `README.md` 정독

### Day 3~4: 코드 구조 파악

- [ ] [02-아키텍처](./02-architecture.md) + [03-디렉토리 구조](./03-directory-structure.md) 정독
- [ ] `contracts/NFTNoteBase.sol` 정독 — **모든 컨트랙트의 기반**
- [ ] F1 전체 플로우 따라가기:
  - `contracts/PrivateNFT.sol` 읽기
  - `circuits/main/private_nft_transfer.circom` 읽기
  - `test/PrivateNFT.test.js` 읽기
  - `frontend/src/pages/F1PrivateNFTPage.tsx` 읽기
- [ ] 테스트 직접 실행: `npx hardhat test test/PrivateNFT.test.js`
- [ ] [04-비즈니스 로직](./04-business-logic.md) 정독

### Day 5~6: 심화 이해

- [ ] F4, F5, F8 각각의 회로 + 컨트랙트 플로우 파악
- [ ] F9 (`CardDrawGame.sol`) Commit-Reveal 메커니즘 이해
- [ ] [05-데이터 구조](./05-data-structures.md) 정독
- [ ] 통합 테스트 실행 (실제 ZK 증명 포함):
  ```bash
  npx hardhat test test/PrivateNFT.integration.test.js --timeout 300000
  ```
- [ ] [08-보안 고려사항](./08-security.md) 정독
- [ ] [09-Known Issues](./09-known-issues.md) 정독

### Day 7: 실전 투입 준비

- [ ] Known Issues 중 1개를 직접 확인하고 수정 시도
- [ ] 코드 수정 → 테스트 실행 사이클 연습
- [ ] [06-API 명세](./06-api-reference.md) 를 참조용으로 북마크
- [ ] 기존 `docs/` 폴더의 상세 문서 확인:
  - `docs/circuits.md` — 회로 상세 설계
  - `docs/contracts.md` — 컨트랙트 상세 설계
  - `docs/testing.md` — 테스트 가이드

---

## Part C: 핵심 코드 읽기 가이드

### "이 파일 하나만 먼저 읽어라" 순서

| 순서 | 파일 | 이유 |
|---|---|---|
| 1 | `contracts/NFTNoteBase.sol` | 모든 컨트랙트가 상속하는 기반. Note/Nullifier 개념 이해 필수 |
| 2 | `contracts/PrivateNFT.sol` | 가장 단순한 피처. ZK 증명 검증 패턴의 기본형 |
| 3 | `circuits/main/private_nft_transfer.circom` | 가장 단순한 회로. Poseidon 해시 + 소유권 증명 패턴 |
| 4 | `frontend/src/hooks/useWallet.tsx` | 지갑 연결 구조 (Context API) |
| 5 | `frontend/src/lib/contracts.ts` | 컨트랙트 인스턴스 생성 방식 |
| 6 | `frontend/src/lib/noteStore.ts` | 오프체인 Note 관리 방식 |
| 7 | `contracts/CardDrawGame.sol` | 가장 복잡한 컨트랙트. Commit-Reveal 이해용 |

### 피처별 "3파일 세트"

각 피처를 이해하려면 이 3개 파일을 순서대로 읽으면 된다:

| 피처 | 1. 회로 | 2. 컨트랙트 | 3. 프론트엔드 |
|---|---|---|---|
| F1 | `circuits/main/private_nft_transfer.circom` | `contracts/PrivateNFT.sol` | `frontend/src/pages/F1PrivateNFTPage.tsx` |
| F4 | `circuits/main/loot_box_open.circom` | `contracts/LootBoxOpen.sol` | `frontend/src/pages/F4LootBoxPage.tsx` |
| F5 | `circuits/main/gaming_item_trade.circom` | `contracts/GamingItemTrade.sol` | `frontend/src/pages/F5GamingItemTradePage.tsx` |
| F8 | `circuits/main/card_draw.circom` | `contracts/CardDraw.sol` | `frontend/src/pages/F8CardDrawPage.tsx` |
| F9 | (F8 회로 재사용) | `contracts/CardDrawGame.sol` | `frontend/src/pages/CardDrawGamePage.tsx` |
