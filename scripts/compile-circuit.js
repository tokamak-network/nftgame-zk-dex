/**
 * Circuit Compilation Script
 *
 * Usage:
 *   node scripts/compile-circuit.js <circuit-name>
 *   node scripts/compile-circuit.js private_nft_transfer
 *
 * Steps:
 *   1. Compile .circom → .r1cs + .wasm
 *   2. Generate zkey (Groth16 setup)
 *   3. Export verification key
 *   4. Export Solidity verifier
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const circuitName = process.argv[2];
if (!circuitName) {
  console.error("Usage: node scripts/compile-circuit.js <circuit-name>");
  console.error("Example: node scripts/compile-circuit.js private_nft_transfer");
  process.exit(1);
}

const CIRCUITS_DIR = path.join(__dirname, "..", "circuits");
const MAIN_DIR = path.join(CIRCUITS_DIR, "main");
const BUILD_DIR = path.join(CIRCUITS_DIR, "build", circuitName);
const PTAU_FILE = path.join(CIRCUITS_DIR, "ptau", "powersOfTau28_hez_final_22.ptau");
const VERIFIERS_DIR = path.join(__dirname, "..", "contracts", "verifiers");
const FRONTEND_CIRCUITS_DIR = path.join(__dirname, "..", "frontend", "public", "circuits");

const circuitFile = path.join(MAIN_DIR, `${circuitName}.circom`);
if (!fs.existsSync(circuitFile)) {
  console.error(`Circuit file not found: ${circuitFile}`);
  process.exit(1);
}

// Create build directory
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(FRONTEND_CIRCUITS_DIR, { recursive: true });

function run(cmd, label) {
  console.log(`\n[${label}] ${cmd}\n`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  // 1. Compile circom
  run(
    `circom ${circuitFile} --r1cs --wasm --sym -o ${BUILD_DIR}`,
    "Compile"
  );

  const r1csFile = path.join(BUILD_DIR, `${circuitName}.r1cs`);
  const wasmFile = path.join(BUILD_DIR, `${circuitName}_js`, `${circuitName}.wasm`);

  // 2. Groth16 setup
  const zkeyFile = path.join(BUILD_DIR, `${circuitName}.zkey`);
  const zkey0File = path.join(BUILD_DIR, `${circuitName}_0.zkey`);

  run(
    `npx snarkjs groth16 setup ${r1csFile} ${PTAU_FILE} ${zkey0File}`,
    "Groth16 Setup"
  );

  // Contribute to phase 2
  run(
    `npx snarkjs zkey contribute ${zkey0File} ${zkeyFile} --name="Dev Contribution" -v -e="random entropy for dev"`,
    "Phase 2 Contribution"
  );

  // Clean up intermediate file
  fs.unlinkSync(zkey0File);

  // 3. Export verification key
  const vkeyFile = path.join(BUILD_DIR, `${circuitName}_vkey.json`);
  run(
    `npx snarkjs zkey export verificationkey ${zkeyFile} ${vkeyFile}`,
    "Export Verification Key"
  );

  // 4. Export Solidity verifier
  const verifierName = circuitName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  const solidityFile = path.join(VERIFIERS_DIR, `${verifierName}Verifier.sol`);
  run(
    `npx snarkjs zkey export solidityverifier ${zkeyFile} ${solidityFile}`,
    "Export Solidity Verifier"
  );

  // 5. Copy wasm and zkey to frontend/public for browser proof generation
  fs.copyFileSync(wasmFile, path.join(FRONTEND_CIRCUITS_DIR, `${circuitName}.wasm`));
  fs.copyFileSync(zkeyFile, path.join(FRONTEND_CIRCUITS_DIR, `${circuitName}.zkey`));
  fs.copyFileSync(vkeyFile, path.join(FRONTEND_CIRCUITS_DIR, `${circuitName}_vkey.json`));

  console.log(`\n✅ Circuit '${circuitName}' compiled successfully!`);
  console.log(`   R1CS:      ${r1csFile}`);
  console.log(`   WASM:      ${wasmFile}`);
  console.log(`   ZKey:      ${zkeyFile}`);
  console.log(`   VKey:      ${vkeyFile}`);
  console.log(`   Verifier:  ${solidityFile}`);
  console.log(`   Frontend:  ${FRONTEND_CIRCUITS_DIR}/`);
} catch (err) {
  console.error(`\n❌ Failed to compile circuit '${circuitName}'`);
  console.error(err.message);
  process.exit(1);
}
