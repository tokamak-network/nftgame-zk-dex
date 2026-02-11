# NFT Gaming ZK-DEX

ZK-SNARKs 기반의 **기밀성 보장형 NFT 게이밍 DEX** 프로젝트입니다. 이 시스템은 NFT 소유권의 증명과 전송 과정에서 개인정보를 보호하며, 온체인 상의 프라이버시를 강화한 NFT 거래 및 게임 아이템 교환 환경을 제공합니다.

## 프로젝트 개요

본 프로젝트는 영지식 증명(Zero-Knowledge Proofs)을 활용하여 전통적인 NFT 전송 방식의 단점인 '소유권 노출' 문제를 해결합니다. 사용자는 자신의 NFT 소유권을 증명하면서도, 구체적인 자산 내역이나 거래 경로를 외부에 드러내지 않고 안전하게 전송할 수 있습니다.

### 구현된 기능

| 기능 | 설명 | 상태 |
|------|------|------|
| **F1: Private NFT Transfer** | UTXO 스타일 노트를 활용한 비공개 NFT 소유권 이전 | 완료 |
| **F5: Gaming Item Trade** | 결제 지원 및 게임 생태계 격리가 포함된 P2P 게임 아이템 거래 | 완료 |
| **F8: Card Draw** | 검증 가능한 랜덤 카드 뽑기 시스템 | 예정 |

### F1: 비공개 NFT 전송
- **비공개 NFT 전송**: UTXO 스타일의 '노트(Note)' 시스템을 활용하여 NFT 소유권 이전.
- **온체인 검증**: Groth16 증명을 통해 온체인에서 전송의 유효성을 즉시 검증.
- **이중 지불 방지**: 널리파이어(Nullifier) 메커니즘을 적용하여 동일 자산의 중복 사용 차단.
- **데이터 보안**: ECDH 암호화를 통해 수신자만 자신의 자산 데이터를 복호화 가능.

### F5: 게이밍 아이템 거래
- **비공개 아이템 거래**: 7-입력 Poseidon 노트 커밋먼트로 아이템 속성을 보존하며 거래.
- **결제 지원**: 유료 거래와 무료 선물(price=0) 모두 지원.
- **게임 생태계 격리**: `gameId` 바인딩으로 서로 다른 게임 간 아이템 이동 차단.
- **속성 보존**: `itemType`과 `itemAttributes`가 거래 간에 암호학적으로 보존됨을 보장.

---

## 기술 스택

- **Smart Contracts**: `Solidity 0.8.20`, `Hardhat`
- **ZK Logic**: `Circom 2.1.0`, `SnarkJS`, `Groth16`
- **Hashing & Crypto**: `Poseidon Hash`, `BabyJubJub Curve`, `ECDH`
- **Frontend**: `React`, `TypeScript`, `Vite`, `Ethers.js`
- **Testing**: `Mocha`, `Chai`

---

## 프로젝트 구조

```text
.
├── circuits/
│   ├── main/                  # 메인 회로 파일
│   │   ├── private_nft_transfer.circom   # F1 회로
│   │   └── gaming_item_trade.circom      # F5 회로
│   ├── utils/                 # 공용 유틸리티 회로
│   │   ├── babyjubjub/        # 소유권 증명, 키 파생
│   │   ├── nullifier.circom   # 널리파이어 계산
│   │   └── poseidon/          # Poseidon 노트 해싱
│   ├── build/                 # 컴파일된 회로 산출물 (r1cs, wasm, zkey)
│   └── ptau/                  # Powers of Tau 세레모니 파일
├── contracts/
│   ├── NFTNoteBase.sol        # 노트/널리파이어 관리 베이스 컨트랙트
│   ├── PrivateNFT.sol         # F1 메인 컨트랙트
│   ├── GamingItemTrade.sol    # F5 메인 컨트랙트
│   ├── verifiers/             # Groth16 검증자 컨트랙트 + 인터페이스
│   └── test/                  # 단위 테스트용 Mock 검증자
├── test/
│   ├── circuits/              # 회로 수준 단위 테스트 (snarkjs, 블록체인 없음)
│   ├── PrivateNFT.test.js             # F1 컨트랙트 단위 테스트
│   ├── PrivateNFT.integration.test.js # F1 통합 테스트 (실제 ZK 증명)
│   ├── GamingItemTrade.test.js             # F5 컨트랙트 단위 테스트
│   └── GamingItemTrade.integration.test.js # F5 통합 테스트 (실제 ZK 증명)
├── scripts/
│   ├── compile-circuit.js     # 회로 컴파일 파이프라인
│   └── lib/                   # JS 암호화 유틸리티
├── frontend/                  # React + TypeScript 프론트엔드
├── docs/                      # 문서
│   ├── setup.md               # 환경 설정 가이드
│   ├── testing.md             # 테스트 가이드
│   ├── circuits.md            # ZK 회로 아키텍처
│   └── contracts.md           # 스마트 컨트랙트 아키텍처
└── hardhat.config.js
```

---

## 테스트 현황 (85/85 통과)

모든 핵심 기능에 대한 테스트가 3개 프레임워크에 걸쳐 완료되어 안정성을 확보했습니다.

### F1: 비공개 NFT 전송 (38개 테스트)

| 카테고리 | 테스트 수 | 내용 |
|----------|-----------|------|
| 회로 단위 (Mocha) | 11 | 유효한 증명 생성, 잘못된 sk/nftId/salt, public signal 변조 |
| 컨트랙트 단위 - Hardhat (Mock) | 4 | 등록, 중복 거부, Mock 검증자 전송, 널리파이어 재사용 |
| 컨트랙트 단위 - Foundry (Mock + Fuzz) | 14 | 등록, 전송, 체인전송, revert, 이벤트, fuzz (256회) |
| 통합 (실제 ZK) | 9 | 실제 증명 전송, 체인 전송 A->B->C, 이중 지불, 이벤트 발생 |

### F5: 게이밍 아이템 거래 (47개 테스트)

| 카테고리 | 테스트 수 | 내용 |
|----------|-----------|------|
| 회로 단위 (Mocha) | 12 | 유료/선물 거래, 잘못된 sk/itemId/gameId/nullifier/attributes/payment, 변조 |
| 컨트랙트 단위 - Hardhat (Mock) | 9 | 등록, 중복, 게임 격리, 유료/선물 거래, 널리파이어 재사용, 이벤트 |
| 컨트랙트 단위 - Foundry (Mock + Fuzz) | 17 | 등록, 유료/선물 거래, 체인거래, 게임 격리, revert, 이벤트, fuzz (256회) |
| 통합 (실제 ZK) | 9 | 실제 증명 유료/선물 거래, 체인 거래 A->B->C, 이중 지불, 이벤트 발생 |

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. ZK 회로 컴파일 (circom 설치 필요)
node scripts/compile-circuit.js private_nft_transfer
node scripts/compile-circuit.js gaming_item_trade

# 3. 스마트 컨트랙트 컴파일
npx hardhat compile

# 4. 전체 테스트 실행
npx hardhat test
npx mocha test/circuits/ --timeout 120000
forge test
```

자세한 환경 설정은 [docs/setup.md](docs/setup.md), 전체 테스트 가이드는 [docs/testing.md](docs/testing.md)를 참고하세요.

---

## 보안 로직

### 노트 구조

| 기능 | 노트 해시 | 입력 수 |
|------|-----------|---------|
| F1 (NFT) | `Poseidon(pkX, pkY, nftId, collectionAddress, salt)` | 5 |
| F5 (아이템) | `Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)` | 7 |
| F5 (결제) | `Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)` | 5 |

### 핵심 메커니즘
- **영지식 증명**: 송신자의 Private Key를 공개하지 않고도 해당 자산의 정당한 소유자임을 수학적으로 증명.
- **널리파이어**: `Poseidon(itemId, salt, sk)`를 통해 각 전송마다 유니크한 값을 생성, 온체인에서 기록하여 재사용 공격 방지.
- **게임 격리**: F5 아이템은 `gameId`에 바인딩되어 게임 간 아이템 유출 방지.

---

## 문서

| 문서 | 설명 |
|------|------|
| [환경 설정 가이드](docs/setup.md) | 사전 요구사항, 설치, 회로 컴파일 |
| [테스트 가이드](docs/testing.md) | 각 테스트 스위트 실행 방법, 예상 결과 |
| [회로 아키텍처](docs/circuits.md) | ZK 회로 설계, 시그널 명세, 제약조건 분석 |
| [컨트랙트 아키텍처](docs/contracts.md) | 스마트 컨트랙트 설계, 인터페이스, 상속 구조 |

---

## Language
- [English](./README.md)
