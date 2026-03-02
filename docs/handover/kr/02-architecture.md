# 2. 시스템 아키텍처

[< 목차로 돌아가기](./README.md)

---

## 2.1 전체 구조도

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                           │
│  React 19.2.0 + TypeScript 5.9.3 + Vite 7.3.1 + Tailwind 4.1.18  │
│                                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Pages   │  │   Hooks   │  │ Proof Gen    │  │  Note Store   │ │
│  │ (7 routes│  │ useWallet  │  │ snarkjs WASM │  │ localStorage  │ │
│  │  F1~F9)  │  │ useContract│  │ circomlibjs  │  │ per-address   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  └───────────────┘ │
│       │               │               │                             │
│       └───────────────┼───────────────┘                             │
│                       │                                             │
│              ethers.js 6.16.0 (JSON-RPC)                           │
│                       │                                             │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   EVM Blockchain (Hardhat Local)                    │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐               │
│  │ NFTNoteBase │  │  MockERC20  │  │  Groth16     │               │
│  │ (Base)      │  │  (TON)      │  │  Verifiers   │               │
│  └──────┬──────┘  └─────────────┘  │  (4 contracts│               │
│         │                           └──────────────┘               │
│  ┌──────┴──────────────────────────────────────┐                   │
│  │ PrivateNFT │ LootBoxOpen │ GamingItemTrade  │                   │
│  │ CardDraw   │ CardDrawGame                   │                   │
│  └─────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                        ▲
                        │ (circuit artifacts: .wasm, .zkey)
┌───────────────────────┴─────────────────────────────────────────────┐
│                     ZK Circuit Layer (Circom 2.1.0)                 │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   Main Circuits     │  │   Utility Circuits                   │ │
│  │ private_nft_transfer │  │ nullifier, poseidon_vrf,            │ │
│  │ loot_box_open       │  │ fisher_yates, proof_of_ownership,    │ │
│  │ gaming_item_trade   │  │ deck_commitment, array_read,         │ │
│  │ card_draw           │  │ get_pubkey                           │ │
│  └─────────────────────┘  └──────────────────────────────────────┘ │
│                                                                     │
│  Proof System: Groth16 | Hash: Poseidon | Curve: BabyJubJub       │
│  PTAU: powersOfTau28_hez_final_22.ptau (2^22)                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 2.2 레이어별 역할

| 레이어 | 역할 | 핵심 기술 |
|---|---|---|
| **Frontend** | 지갑 연결, ZK 증명 생성 (브라우저), TX 전송, Note 관리 | React, snarkjs WASM, ethers.js |
| **Blockchain** | 증명 검증, Note 상태 관리, Nullifier 기록, 결제 처리 | Solidity, Groth16 Verifier |
| **ZK Circuit** | 소유권 증명, 커미트먼트 계산, VRF, 셔플 검증 회로 정의 | Circom, Poseidon, BabyJubJub |

## 2.3 기술 스택 상세 (버전 포함)

### 스마트 컨트랙트

| 기술 | 버전 | 용도 |
|---|---|---|
| Solidity | 0.8.20 | 스마트 컨트랙트 언어 |
| Hardhat | 2.22.0 | 컨트랙트 컴파일, 배포, 테스트 |
| Foundry (Forge) | latest (git submodule) | Solidity 네이티브 테스트 + Fuzz 테스트 |
| OpenZeppelin Contracts | 5.0.0 | ERC20 등 표준 컨트랙트 |
| ethers.js | 6.11.1 (backend) / 6.16.0 (frontend) | 블록체인 인터랙션 |

### 영지식 증명 (ZK)

| 기술 | 버전 | 용도 |
|---|---|---|
| Circom | 2.1.0 | ZK 회로 작성 언어 |
| SnarkJS | 0.7.6 | Groth16 증명 생성/검증 |
| circomlibjs | 0.1.7 | Poseidon 해시, BabyJubJub 연산 |
| ffjavascript | 0.3.1 | 유한체 연산 라이브러리 |

### 프론트엔드

| 기술 | 버전 | 용도 |
|---|---|---|
| React | 19.2.0 | UI 프레임워크 |
| TypeScript | 5.9.3 | 타입 안전성 |
| Vite | 7.3.1 | 빌드 도구 |
| Tailwind CSS | 4.1.18 | 스타일링 (네온 테마) |
| React Router | 7.13.0 | SPA 라우팅 |

### 테스트

| 기술 | 버전 | 용도 |
|---|---|---|
| Mocha | 10.2.0 | ZK 회로 테스트 |
| Chai | 4.3.0 | 어설션 라이브러리 |
| Hardhat Toolbox | 4.0.0 | 컨트랙트 단위 + 통합 테스트 |
| Foundry/Forge | latest | Fuzz 테스트 (256 runs) |

### 런타임

| 기술 | 버전 | 비고 |
|---|---|---|
| Node.js | >=18 (권장: 20, `.nvmrc` 참조) | 런타임 |
| npm | (Node.js 포함) | 패키지 매니저 |

## 2.4 외부 의존성

| 의존성 | 유형 | 설명 |
|---|---|---|
| MetaMask | 브라우저 확장 | 지갑 연결 (`window.ethereum`) |
| Circom 컴파일러 | 시스템 설치 | 회로 컴파일에 필요 (별도 설치) |
| Powers of Tau 파일 | 파일 다운로드 | `circuits/ptau/powersOfTau28_hez_final_22.ptau` (~4.5GB) |
| Hermez PTAU Ceremony | 외부 의존 | Groth16 Phase 1 신뢰 설정 |
| forge-std | git submodule | Foundry 테스트 표준 라이브러리 |
| Google Fonts | CDN | Orbitron, Rajdhani, JetBrains Mono |

## 2.5 컨트랙트 상속 구조

```
NFTNoteBase (Note/Nullifier 상태 관리)
  ├── PrivateNFT        (F1)
  ├── LootBoxOpen       (F4)  + IERC20 paymentToken
  ├── GamingItemTrade   (F5)  + IERC20 paymentToken
  ├── CardDraw          (F8)
  └── CardDrawGame      (F9)  + IERC20 paymentToken (독립 상속 아님, CardDraw 미상속)

IGroth16Verifier (인터페이스)
  ├── INFTTransferVerifier      → PrivateNftTransferVerifier.sol
  ├── ILootBoxVerifier          → LootBoxOpenVerifier.sol
  ├── IGamingItemTradeVerifier  → GamingItemTradeVerifier.sol
  └── ICardDrawVerifier         → CardDrawVerifier.sol

MockERC20 (OpenZeppelin ERC20 상속, "TokamakNetwork" / "TON")
```

## 2.6 데이터 흐름 요약

```
┌────────────────┐   ZK Proof    ┌──────────────────┐
│   User Browser │ ─────────────→│  Smart Contract  │
│                │               │                  │
│ 1. 키페어 생성  │  (a, b, c,   │ 1. 증명 검증     │
│ 2. Note 계산   │   publicInputs│ 2. Note 상태변경  │
│ 3. 증명 생성   │   )           │ 3. Nullifier 기록 │
│ 4. TX 전송     │               │ 4. 이벤트 발행    │
│                │               │                  │
│ snarkjs WASM   │  ◄────────── │ Groth16Verifier   │
│ circomlibjs    │  TX Receipt   │ (Precompiled     │
│ ethers.js      │               │  ecPairing)      │
└────────────────┘               └──────────────────┘
        │
        ▼
┌────────────────┐
│  localStorage  │
│ Note 저장/조회  │
│ (per-address)  │
└────────────────┘
```

> REST API 서버가 없다. 모든 데이터는 온체인(스마트 컨트랙트) + 오프체인(localStorage)에 저장된다.
