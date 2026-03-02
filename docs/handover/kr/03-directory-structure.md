# 3. 디렉토리 구조

[< 목차로 돌아가기](./README.md)

---

## 3.1 전체 트리

```
nftGame-zk-dex/
├── circuits/                          # ZK 회로 코드 (Circom)
│   ├── main/                          #   핵심 피처 회로 4개
│   │   ├── private_nft_transfer.circom  # F1: NFT 프라이버시 전송
│   │   ├── loot_box_open.circom         # F4: 루트박스 개봉
│   │   ├── gaming_item_trade.circom     # F5: 아이템 거래
│   │   └── card_draw.circom             # F8: 카드 드로우 (52장 셔플)
│   ├── utils/                         #   공유 유틸리티 회로
│   │   ├── babyjubjub/                  # 타원곡선 연산, 소유권 증명
│   │   ├── vrf/                         # Poseidon VRF (검증 가능 랜덤)
│   │   ├── shuffle/                     # Fisher-Yates 셔플 검증
│   │   ├── poseidon/                    # Poseidon 해시, 덱 커미트먼트
│   │   ├── array/                       # 변수 인덱스 배열 접근
│   │   ├── nullifier.circom             # 널리파이어 계산
│   │   └── pack/                        # 데이터 패킹
│   ├── build/                         #   컴파일 결과물 (r1cs, wasm, zkey)
│   └── ptau/                          #   Powers of Tau 파일 (.gitignore)
│
├── contracts/                         # Solidity 스마트 컨트랙트
│   ├── NFTNoteBase.sol                  # 기반: Note/Nullifier 상태 관리
│   ├── PrivateNFT.sol                   # F1
│   ├── LootBoxOpen.sol                  # F4
│   ├── GamingItemTrade.sol              # F5
│   ├── CardDraw.sol                     # F8
│   ├── CardDrawGame.sol                 # F9
│   ├── verifiers/                     #   자동생성 Groth16 검증 컨트랙트
│   │   ├── IGroth16Verifier.sol           # 검증자 인터페이스 (4개)
│   │   ├── PrivateNftTransferVerifier.sol # F1 검증자
│   │   ├── LootBoxOpenVerifier.sol        # F4 검증자
│   │   ├── GamingItemTradeVerifier.sol    # F5 검증자
│   │   └── CardDrawVerifier.sol           # F8 검증자
│   └── test/                          #   테스트용 Mock 컨트랙트
│       ├── Mock*Verifier.sol              # 항상 true 반환
│       └── MockERC20.sol                  # 테스트용 TON 토큰
│
├── frontend/                          # React 프론트엔드
│   ├── src/
│   │   ├── pages/                       # 페이지 컴포넌트 (7개 라우트)
│   │   ├── components/                  # 재사용 컴포넌트
│   │   ├── hooks/                       # React Hooks
│   │   ├── lib/                         # 유틸리티
│   │   ├── abi/                         # 컨트랙트 ABI JSON
│   │   ├── config/                      # deployedAddresses.json
│   │   ├── App.tsx                      # 라우터 + WalletProvider
│   │   ├── main.tsx                     # 엔트리 포인트
│   │   └── index.css                    # 글로벌 스타일 (네온 테마)
│   ├── public/circuits/                 # 브라우저용 .wasm, .zkey
│   ├── vite.config.ts                   # Vite 빌드 설정
│   └── package.json                     # 프론트엔드 의존성
│
├── scripts/                           # 빌드/배포 스크립트
│   ├── compile-circuit.js               # 회로 컴파일 파이프라인
│   ├── deploy.js                        # 컨트랙트 배포 (Hardhat)
│   ├── copy-frontend-assets.js          # 프론트엔드 에셋 복사
│   └── lib/                           #   JS 암호학 유틸리티
│       ├── snarkjsUtils.js                # 증명 생성/검증 헬퍼
│       ├── Note.js / Wallet.js            # Note/지갑 클래스
│       ├── circomlibBabyJub.js            # BabyJubJub 연산
│       ├── ecdhCrypto.js                  # ECDH 암호화
│       └── util.js                        # 범용 유틸
│
├── test/                              # 테스트 스위트
│   ├── circuits/                        # 회로 단위 테스트 (Mocha)
│   ├── foundry/                         # Foundry 테스트 (Solidity)
│   ├── *.test.js                        # Hardhat 단위 테스트 (Mock 검증자)
│   └── *.integration.test.js            # Hardhat 통합 테스트 (실제 ZK 증명)
│
├── forge-out/                         # Foundry 빌드 출력
├── artifacts/                         # Hardhat 빌드 출력
├── lib/forge-std/                     # Foundry 표준 라이브러리 (git submodule)
│
├── hardhat.config.js                  # Hardhat 설정
├── foundry.toml                       # Foundry 설정
├── remappings.txt                     # Solidity import 경로 매핑
├── package.json                       # 루트 의존성
├── .nvmrc                             # Node.js 버전 (v20)
└── .gitmodules                        # Git 서브모듈 (forge-std)
```

## 3.2 핵심 파일 빠른 참조

### 설정 파일

| 파일 | 설명 |
|---|---|
| `hardhat.config.js` | Solidity 0.8.20, optimizer 200 runs, via-IR, chainId 1337 |
| `foundry.toml` | src=contracts, out=forge-out, test=test/foundry, fuzz 256 runs |
| `remappings.txt` | `forge-std/` → `lib/forge-std/src/`, `@openzeppelin/` → `node_modules/` |
| `frontend/vite.config.ts` | React, Tailwind, port 3000, COOP/COEP 헤더, `/api` 프록시 |
| `.nvmrc` | Node.js v20 |

### 자주 수정하는 파일

| 목적 | 파일 경로 |
|---|---|
| 컨트랙트 배포 | `scripts/deploy.js` |
| 회로 컴파일 | `scripts/compile-circuit.js` |
| 배포된 주소 | `frontend/src/config/deployedAddresses.json` |
| 지갑 연결 | `frontend/src/hooks/useWallet.tsx` |
| 컨트랙트 인스턴스 | `frontend/src/lib/contracts.ts` |
| ZK 증명 생성 | `frontend/src/lib/proofGenerator.ts` |
| 암호학 유틸 | `frontend/src/lib/crypto.ts` |
| Note 저장소 | `frontend/src/lib/noteStore.ts` |
| 라우트 설정 | `frontend/src/App.tsx` |

### 프론트엔드 라우트

| 경로 | 컴포넌트 | 설명 |
|---|---|---|
| `/` | `HomePage` | 기능 소개 카드 |
| `/f1-private-nft` | `F1PrivateNFTPage` | 4단계 NFT 전송 |
| `/f4-loot-box` | `F4LootBoxPage` | 5단계 루트박스 |
| `/f5-item-trade` | `F5GamingItemTradePage` | 탭 기반 거래 |
| `/f8-card-draw` | `F8CardDrawPage` | 싱글 카드 드로우 |
| `/f9-card-game` | `CardDrawGamePage` | 멀티플레이어 |
| `/my-notes` | `MyNotesPage` | Note 관리 |
