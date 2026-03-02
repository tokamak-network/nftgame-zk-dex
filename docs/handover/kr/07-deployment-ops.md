# 7. 배포 및 운영

[< 목차로 돌아가기](./README.md)

---

## 7.1 사전 요구사항

| 도구 | 설치 방법 | 확인 명령 |
|---|---|---|
| Node.js v20 | `nvm install 20` | `node -v` |
| npm | Node.js 포함 | `npm -v` |
| Circom 2.1.0 | [docs.circom.io](https://docs.circom.io/getting-started/installation/) | `circom --version` |
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | `forge --version` |
| MetaMask | Chrome Web Store | 브라우저 확장 확인 |

---

## 7.2 설치 단계

```bash
# 1. 저장소 클론 (서브모듈 포함)
git clone --recurse-submodules <repo-url>
cd nftGame-zk-dex

# 2. Node.js 버전 설정
nvm use

# 3. 루트 의존성 설치
npm install

# 4. 프론트엔드 의존성 설치
cd frontend && npm install && cd ..

# 5. Powers of Tau 파일 다운로드 (~4.5GB, 최초 1회)
mkdir -p circuits/ptau
wget -O circuits/ptau/powersOfTau28_hez_final_22.ptau \
  https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau

# 6. ZK 회로 컴파일 (각각 수 분~수십 분 소요)
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js loot_box_open
node scripts/compile-circuit.js gaming_item_trade
node scripts/compile-circuit.js card_draw    # 가장 오래 걸림 (~5-10분)

# 7. 스마트 컨트랙트 컴파일
npx hardhat compile
```

---

## 7.3 로컬 실행

```bash
# 터미널 1: 로컬 블록체인 실행
npx hardhat node

# 터미널 2: 컨트랙트 배포
npx hardhat run scripts/deploy.js --network localhost
# → frontend/src/config/deployedAddresses.json 자동 생성

# 터미널 3: 프론트엔드 실행
cd frontend && npm run dev
# → http://localhost:3000
```

### MetaMask 네트워크 설정

| 항목 | 값 |
|---|---|
| 네트워크 이름 | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `1337` |
| 통화 기호 | ETH |

> Hardhat node 실행 시 출력되는 테스트 계정의 Private Key를 MetaMask에 임포트한다.

---

## 7.4 테스트 실행

```bash
# 전체 Hardhat 테스트 (단위 + 통합)
npx hardhat test

# ZK 회로 테스트만 (Mocha)
npx mocha test/circuits/ --timeout 120000

# Foundry 테스트 (Fuzz 256 runs 포함)
forge test

# 통합 테스트만 (실제 ZK 증명 사용, 느림)
npx hardhat test test/*.integration.test.js --timeout 300000
```

### 테스트 현황 (170/170 통과)

| 피처 | 회로 (Mocha) | Unit (Hardhat) | Unit (Foundry) | 통합 (Real ZK) | 합계 |
|---|---|---|---|---|---|
| F1 | 11 | 4 | 14 | 9 | 38 |
| F4 | 15 | 9 | 15 | 9 | 48 |
| F5 | 12 | 9 | 17 | 9 | 47 |
| F8 | 14 | 9 | 15 | 8 | 46 |
| **합계** | **52** | **31** | **61** | **35** | **~170** |

---

## 7.5 환경 변수

> 현재 `.env` 파일이 **존재하지 않으며**, 모든 설정이 하드코딩되어 있다.

### 하드코딩된 설정값

| 값 | 위치 | 설명 |
|---|---|---|
| `chainId: 1337` | `hardhat.config.js` | 로컬 체인 ID |
| `BOX_PRICE: 10 TON` | `scripts/deploy.js` | 루트박스 가격 |
| `ENTRY_FEE: 10 TON` | `scripts/deploy.js` | 카드게임 참가비 |
| `DEFAULT_TIMEOUT: 60s` | `scripts/deploy.js` | 게임 기본 타임아웃 |
| 컨트랙트 주소 | `frontend/src/config/deployedAddresses.json` | 배포 시 자동 생성 |
| `FEE_PERCENT: 10` | `CardDrawGame.sol` | 게임 수수료 10% |
| `MAX_PLAYERS: 5` | `CardDrawGame.sol` | 게임 최대 인원 |
| `REVEAL_TIMEOUT: 120` | `CardDrawGame.sol` | 공개 제한시간 (초) |

---

## 7.6 배포 스크립트 동작

`scripts/deploy.js` 실행 시:

1. **MockERC20 (TON)** 배포 → deployer + 테스트 계정 2개에 각 10,000 TON 민팅
2. 각 피처별 순차 배포:
   - Verifier 컨트랙트 배포
   - Main 컨트랙트 배포 (Verifier 주소 주입)
3. 모든 주소를 `frontend/src/config/deployedAddresses.json`에 기록

| 순서 | Verifier | Main Contract | 추가 인자 |
|---|---|---|---|
| 1 | PrivateNftTransferVerifier | PrivateNFT | - |
| 2 | LootBoxOpenVerifier | LootBoxOpen | tokenAddr, BOX_PRICE |
| 3 | GamingItemTradeVerifier | GamingItemTrade | tokenAddr |
| 4 | CardDrawVerifier | CardDraw | - |
| 5 | CardDrawVerifier (재사용) | CardDrawGame | tokenAddr, ENTRY_FEE, TIMEOUT |

---

## 7.7 CI/CD

| 항목 | 현재 상태 |
|---|---|
| CI/CD 파이프라인 | **미구성** |
| GitHub Actions | 설정 파일 없음 |
| 자동 테스트 | 수동 실행만 |
| 자동 배포 | 수동 실행만 |

> **확인 필요:** 프로덕션 배포 대상 네트워크 및 CI/CD 구축 계획

---

## 7.8 프론트엔드 빌드

```bash
cd frontend && npm run build
# → frontend/dist/ 에 정적 파일 생성

cd frontend && npm run preview
# → 프로덕션 빌드 프리뷰
```
