# Environment Setup Guide

## Prerequisites

The following tools must be installed before building the project.

### 1. Node.js

- **Version**: 18.x or higher
- **Install**: https://nodejs.org/

```bash
node --version   # v18.x+
npm --version    # 9.x+
```

### 2. Circom (ZK Circuit Compiler)

- **Version**: 2.1.0+
- **Install**: https://docs.circom.io/getting-started/installation/

```bash
# Install via Rust cargo
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

# Verify
circom --version   # circom compiler 2.1.0+
```

### 3. Foundry (Forge)

- **Version**: 1.0+
- **Install**: https://book.getfoundry.sh/getting-started/installation

```bash
# Install via foundryup
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify
forge --version
```

### 4. Hardhat (Smart Contract Framework)

Installed automatically via `npm install` (local dependency).

---

## Installation

### 1. Clone and Install Dependencies

```bash
git clone --recurse-submodules <repository-url>
cd nftGame-zk-dex
npm install
```

If you already cloned without `--recurse-submodules`:
```bash
git submodule update --init --recursive
```

### 2. Frontend Dependencies (optional)

```bash
cd frontend
npm install
cd ..
```

### 3. Powers of Tau File

The ZK circuit compilation requires a Powers of Tau (ptau) file. This project uses `powersOfTau28_hez_final_22.ptau` (~4.5 GB).

The file should be placed at (or symlinked to):
```
circuits/ptau/powersOfTau28_hez_final_22.ptau
```

If not present, download it:
```bash
mkdir -p circuits/ptau
cd circuits/ptau
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau
cd ../..
```

> **Note**: Power 22 supports circuits up to 2^22 = ~4M constraints. Our largest circuit (F5) uses ~7,700 constraints, so this is more than sufficient.

---

## Circuit Compilation

Each circuit must be compiled separately. The compilation pipeline:
1. **circom** compiles `.circom` to `.r1cs` + `.wasm`
2. **snarkjs** generates the Groth16 proving key (`.zkey`)
3. **snarkjs** exports the verification key (`.vkey.json`)
4. **snarkjs** exports the Solidity verifier contract (`.sol`)

### Compile All Circuits

```bash
# F1: Private NFT Transfer
node scripts/compile-circuit.js private_nft_transfer

# F4: Loot Box Open
node scripts/compile-circuit.js loot_box_open

# F5: Gaming Item Trade
node scripts/compile-circuit.js gaming_item_trade
```

### Compile Output

Each circuit produces the following in `circuits/build/<circuit_name>/`:

| File | Description |
|------|-------------|
| `<name>.r1cs` | Rank-1 Constraint System |
| `<name>_js/<name>.wasm` | WebAssembly witness generator |
| `<name>.zkey` | Groth16 proving key |
| `<name>_vkey.json` | Verification key (for off-chain verification) |
| `<name>.sym` | Symbol table |

Additionally, a Solidity verifier is generated at `contracts/verifiers/<Name>Verifier.sol`.

### Compilation Time

| Circuit | Constraints | Approx. Time |
|---------|-------------|--------------|
| private_nft_transfer | ~6,400 | ~2 min |
| loot_box_open | ~7,300 | ~2 min |
| gaming_item_trade | ~7,700 | ~2 min |

> Most of the time is spent on the Groth16 setup (zkey generation), not the circom compilation itself.

---

## Smart Contract Compilation

After circuits are compiled (verifiers generated):

```bash
# Hardhat
npx hardhat compile

# Foundry
forge build
```

Both compile all Solidity contracts including the generated Groth16 verifiers.

> **Note**: Three Groth16Verifier contracts exist (one per circuit). Hardhat handles this via fully qualified names like `contracts/verifiers/LootBoxOpenVerifier.sol:Groth16Verifier`.

---

## Local Development

### Start Local Blockchain

```bash
npx hardhat node
```

### Deploy Contracts

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### Start Frontend

```bash
cd frontend
npm run dev
```

---

## Project Configuration

### hardhat.config.js

| Setting | Value |
|---------|-------|
| Solidity version | 0.8.20 |
| EVM target | paris |
| Optimizer | enabled, 200 runs |
| Chain ID | 1337 |

### foundry.toml

| Setting | Value |
|---------|-------|
| src | `contracts` |
| test | `test/foundry` |
| out | `forge-out` |
| libs | `lib` (forge-std) |
| Solidity version | 0.8.20 |
| EVM version | paris |
| Optimizer | enabled, 200 runs |
| Fuzz runs | 256 |

### Network Configuration

| Network | URL | Chain ID |
|---------|-----|----------|
| Hardhat (default) | in-process | 1337 |
| Ganache | http://127.0.0.1:8545 | 1337 |
