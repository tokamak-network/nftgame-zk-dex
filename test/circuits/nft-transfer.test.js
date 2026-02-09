/**
 * Circuit-level unit tests for F1: Private NFT Transfer
 *
 * Tests the circom circuit directly using snarkjs (no blockchain).
 * Verifies that:
 * - Valid inputs produce valid proofs
 * - Invalid inputs (wrong sk, wrong nftId, wrong salt) cause proof generation to fail
 */

const assert = require("assert");
const path = require("path");
const snarkjs = require("snarkjs");
const { poseidonHash, randomSecretKey, getPublicKey, init } = require("../../scripts/lib/circomlibBabyJub");

const CIRCUIT_NAME = "private_nft_transfer";
const BUILD_DIR = path.join(__dirname, "../../circuits/build", CIRCUIT_NAME);
const WASM_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`);
const ZKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`);
const VKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_vkey.json`);

const fs = require("fs");

function checkBuildFiles() {
  if (!fs.existsSync(ZKEY_PATH)) {
    console.log(`\n  ⚠️  Skipping circuit tests: zkey not found at ${ZKEY_PATH}`);
    console.log("     Run: node scripts/compile-circuit.js private_nft_transfer\n");
    return false;
  }
  return true;
}

/**
 * Generate a valid set of circuit inputs for a transfer
 */
async function generateValidInputs() {
  // Old owner (sender)
  const oldOwnerSk = await randomSecretKey();
  const oldOwnerPk = await getPublicKey(oldOwnerSk);

  // New owner (receiver)
  const newOwnerSk = await randomSecretKey();
  const newOwnerPk = await getPublicKey(newOwnerSk);

  const nftId = BigInt(42);
  const collectionAddress = BigInt("0x1234567890abcdef1234567890abcdef12345678");
  const oldSalt = BigInt("0x" + require("crypto").randomBytes(31).toString("hex"));
  const newSalt = BigInt("0x" + require("crypto").randomBytes(31).toString("hex"));

  // Compute old NFT note hash: Poseidon(pkX, pkY, nftId, collectionAddress, salt)
  const oldNftHash = await poseidonHash([
    oldOwnerPk.x, oldOwnerPk.y, nftId, collectionAddress, oldSalt,
  ]);

  // Compute new NFT note hash
  const newNftHash = await poseidonHash([
    newOwnerPk.x, newOwnerPk.y, nftId, collectionAddress, newSalt,
  ]);

  // Compute nullifier: Poseidon(nftId, oldSalt, sk)
  const nullifier = await poseidonHash([nftId, oldSalt, oldOwnerSk]);

  return {
    // Public inputs
    oldNftHash: oldNftHash.toString(),
    newNftHash: newNftHash.toString(),
    nftId: nftId.toString(),
    collectionAddress: collectionAddress.toString(),
    nullifier: nullifier.toString(),
    // Private inputs
    oldOwnerPkX: oldOwnerPk.x.toString(),
    oldOwnerPkY: oldOwnerPk.y.toString(),
    oldOwnerSk: oldOwnerSk.toString(),
    oldSalt: oldSalt.toString(),
    newOwnerPkX: newOwnerPk.x.toString(),
    newOwnerPkY: newOwnerPk.y.toString(),
    newSalt: newSalt.toString(),
    // Keep raw values for tampering tests
    _raw: { oldOwnerSk, oldOwnerPk, newOwnerPk, nftId, collectionAddress, oldSalt, newSalt },
  };
}

describe("F1: Private NFT Transfer Circuit", function () {
  this.timeout(120000);

  let hasBuild;

  before(async function () {
    await init();
    hasBuild = checkBuildFiles();
    if (!hasBuild) this.skip();
  });

  describe("Valid proof generation", function () {
    it("should generate and verify a valid proof", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      // Verify locally
      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      assert.strictEqual(valid, true, "Proof should be valid");
    });

    it("should produce correct public signals order", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      // Public signals should be: [oldNftHash, newNftHash, nftId, collectionAddress, nullifier]
      assert.strictEqual(publicSignals.length, 5, "Should have 5 public signals");
      assert.strictEqual(publicSignals[0], circuitInputs.oldNftHash);
      assert.strictEqual(publicSignals[1], circuitInputs.newNftHash);
      assert.strictEqual(publicSignals[2], circuitInputs.nftId);
      assert.strictEqual(publicSignals[3], circuitInputs.collectionAddress);
      assert.strictEqual(publicSignals[4], circuitInputs.nullifier);
    });

    it("should generate different proofs for different transfers", async function () {
      const inputs1 = await generateValidInputs();
      const inputs2 = await generateValidInputs();
      const { _raw: _r1, ...ci1 } = inputs1;
      const { _raw: _r2, ...ci2 } = inputs2;

      const result1 = await snarkjs.groth16.fullProve(ci1, WASM_PATH, ZKEY_PATH);
      const result2 = await snarkjs.groth16.fullProve(ci2, WASM_PATH, ZKEY_PATH);

      // Proofs should be different
      assert.notDeepStrictEqual(result1.proof, result2.proof);
      // Public signals should be different (different keys/salts)
      assert.notDeepStrictEqual(result1.publicSignals, result2.publicSignals);
    });
  });

  describe("Invalid inputs should fail", function () {
    it("should fail with wrong secret key", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Use a different secret key
      const wrongSk = await randomSecretKey();
      circuitInputs.oldOwnerSk = wrongSk.toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong sk");
      }
    });

    it("should fail with wrong nftId in old note hash", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Change nftId but keep old hash (mismatch)
      circuitInputs.nftId = "999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with mismatched nftId");
      }
    });

    it("should fail with wrong old salt", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Change old salt (note hash won't match)
      circuitInputs.oldSalt = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong old salt");
      }
    });

    it("should fail with wrong nullifier", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Tamper with nullifier
      circuitInputs.nullifier = "99999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong nullifier");
      }
    });

    it("should fail with wrong old note hash", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Tamper with old note hash
      circuitInputs.oldNftHash = "11111";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong old note hash");
      }
    });

    it("should fail with wrong new note hash", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Tamper with new note hash
      circuitInputs.newNftHash = "22222";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong new note hash");
      }
    });

    it("should fail with swapped owner keys (X/Y mismatch)", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Swap pkX and pkY
      const temp = circuitInputs.oldOwnerPkX;
      circuitInputs.oldOwnerPkX = circuitInputs.oldOwnerPkY;
      circuitInputs.oldOwnerPkY = temp;

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with swapped keys");
      }
    });
  });

  describe("Proof tampering should fail verification", function () {
    it("should reject a valid proof with tampered public signals", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      // Tamper with public signal (change nftId)
      const tamperedSignals = [...publicSignals];
      tamperedSignals[2] = "999";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered proof should be invalid");
    });
  });
});
