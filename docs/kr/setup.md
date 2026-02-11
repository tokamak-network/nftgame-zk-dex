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
`circuits/ptau/powersOfTau28_hez_final_22.ptau`

---

## 회로 컴파일

각 회로는 개별적으로 컴파일되어야 합니다.

```bash
# F1: 비공개 NFT 전송
node scripts/compile-circuit.js private_nft_transfer

# F5: 게임 아이템 거래
node scripts/compile-circuit.js gaming_item_trade
```

### 컴파일 결과물

`circuits/build/<circuit_name>/` 디렉토리에 `.r1cs`, `.wasm`, `.zkey`, `.vkey.json` 등이 생성됩니다. 또한 `contracts/verifiers/` 아래에 솔리디티 검증기 컨트랙트가 생성됩니다.

---

## 스마트 컨트랙트 컴파일

회로 컴파일 후(검증기 생성 후):

```bash
# Hardhat
npx hardhat compile

# Foundry
forge build
```

---

## 로컬 개발

### 1. 로컬 블록체인 시작

```bash
npx hardhat node
```

### 2. 컨트랙트 배포

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 3. 프론트엔드 시작

```bash
cd frontend
npm run dev
```

---

## 프로젝트 설정

### hardhat.config.js
- **Solidity 버전**: 0.8.20
- **EVM 타겟**: paris
- **Optimizer**: enabled, 200 runs
- **Chain ID**: 1337

### foundry.toml
- **src**: `contracts`
- **test**: `test/foundry`
- **Solidity 버전**: 0.8.20
- **EVM 버전**: paris
- **퍼즈 횟수 (Fuzz runs)**: 256
