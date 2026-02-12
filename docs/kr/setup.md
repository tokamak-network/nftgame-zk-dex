# 환경 설정 가이드

## 사전 준비 사항

프로젝트를 빌드하기 전에 다음 도구들이 설치되어 있어야 합니다.

### 1. Node.js

- **버전**: 18.x 이상
- **설치**: https://nodejs.org/

```bash
node --version   # v18.x+
npm --version    # 9.x+
```

### 2. Circom (ZK 회로 컴파일러)

- **버전**: 2.1.0 이상
- **설치**: https://docs.circom.io/getting-started/installation/

```bash
# Rust cargo를 통한 설치
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

# 확인
circom --version   # circom compiler 2.1.0+
```

### 3. Foundry (Forge)

- **버전**: 1.0 이상
- **설치**: https://book.getfoundry.sh/getting-started/installation

```bash
# foundryup을 통한 설치
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 확인
forge --version
```

### 4. Hardhat (스마트 컨트랙트 프레임워크)

`npm install` 시 로컬 의존성으로 자동 설치됩니다.

---

## 설치 방법

### 1. 저장소 클론 및 패키지 설치

```bash
git clone --recurse-submodules <repository-url>
cd nftGame-zk-dex
npm install
```

만약 `--recurse-submodules` 없이 클론했다면:
```bash
git submodule update --init --recursive
```

### 2. 프론트엔드 의존성 (선택 사항)

```bash
cd frontend
npm install
cd ..
```

### 3. Powers of Tau 파일

ZK 회로 컴파일에는 Powers of Tau (ptau) 파일이 필요합니다. 이 프로젝트는 `powersOfTau28_hez_final_22.ptau` (~4.5 GB)를 사용합니다.

파일을 다음 위치에 두거나 심볼릭 링크를 생성하세요:
```
circuits/ptau/powersOfTau28_hez_final_22.ptau
```

파일이 없다면 다운로드하세요:
```bash
mkdir -p circuits/ptau
cd circuits/ptau
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau
cd ../..
```

> **참고**: Power 22는 최대 2^22 = 약 400만 개의 제약 조건(constraints)을 지원합니다. 가장 큰 회로(F8: 카드 뽑기)가 약 99,400개의 제약 조건을 사용하므로 이는 매우 충분한 크기입니다.

---

## 회로 컴파일

각 회로는 개별적으로 컴파일되어야 합니다. 컴파일 파이프라인은 다음과 같습니다:
1. **circom**: `.circom` 파일을 `.r1cs` 및 `.wasm`으로 컴파일
2. **snarkjs**: Groth16 증명 키(`.zkey`) 생성
3. **snarkjs**: 검증 키(`.vkey.json`) 내보내기
4. **snarkjs**: 솔리디티 검증기 컨트랙트(`.sol`) 생성

### 모든 회로 컴파일

```bash
# F1: 비공개 NFT 전송
node scripts/compile-circuit.js private_nft_transfer

# F4: 루트 박스 개봉
node scripts/compile-circuit.js loot_box_open

# F5: 게임 아이템 거래
node scripts/compile-circuit.js gaming_item_trade

# F8: 카드 뽑기 검증 (9.9만 개의 제약 조건으로 인해 약 5-10분 소요)
node scripts/compile-circuit.js card_draw
```

### 컴파일 결과물

각 회로는 `circuits/build/<circuit_name>/` 디렉토리에 다음 파일들을 생성합니다:

| 파일 | 설명 |
|------|-------------|
| `<name>.r1cs` | Rank-1 제약 조건 시스템 |
| `<name>_js/<name>.wasm` | WebAssembly Witness 생성기 |
| `<name>.zkey` | Groth16 증명 키 |
| `<name>_vkey.json` | 검증 키 (오프체인 검증용) |
| `<name>.sym` | 심볼 테이블 |

또한, `contracts/verifiers/<Name>Verifier.sol` 위치에 솔리디티 검증기가 생성됩니다.

### 컴파일 소요 시간

| 회로 | 제약 조건 수 | 대략적인 시간 |
|---------|-------------|--------------|
| private_nft_transfer | ~6,400 | ~2분 |
| loot_box_open | ~7,300 | ~2분 |
| gaming_item_trade | ~7,700 | ~2분 |
| card_draw | ~99,400 | ~5-10분 |

> 대부분의 시간은 circom 컴파일 자체가 아니라 Groth16 설정(zkey 생성)에서 소요됩니다.

---

## 스마트 컨트랙트 컴파일

회로 컴파일 후(검증기 생성 후):

```bash
# Hardhat
npx hardhat compile

# Foundry
forge build
```

두 도구 모두 생성된 Groth16 검증기를 포함한 모든 솔리디티 컨트랙트를 컴파일합니다.

> **참고**: 네 개의 Groth16Verifier 컨트랙트가 존재합니다(회로당 하나). Hardhat은 `contracts/verifiers/CardDrawVerifier.sol:Groth16Verifier`와 같이 정규화된 이름을 통해 이를 처리합니다.

---

## 로컬 개발

### 로컬 블록체인 시작

```bash
npx hardhat node
```

### 컨트랙트 배포

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 프론트엔드 시작

```bash
cd frontend
npm run dev
```

---

## 프로젝트 설정

### hardhat.config.js

| 설정 항목 | 값 |
|---------|-------|
| Solidity 버전 | 0.8.20 |
| EVM 타겟 | paris |
| Optimizer | 활성화, 200 runs |
| Chain ID | 1337 |

### foundry.toml

| 설정 항목 | 값 |
|---------|-------|
| src | `contracts` |
| test | `test/foundry` |
| out | `forge-out` |
| libs | `lib` (forge-std) |
| Solidity 버전 | 0.8.20 |
| EVM 버전 | paris |
| Optimizer | 활성화, 200 runs |
| 퍼즈 횟수 (Fuzz runs) | 256 |

### 네트워크 설정

| 네트워크 | URL | Chain ID |
|---------|-----|----------|
| Hardhat (기본값) | 프로세스 내부 | 1337 |
| Ganache | http://127.0.0.1:8545 | 1337 |
