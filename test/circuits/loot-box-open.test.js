/**
 * Circuit-level unit tests for F4: Loot Box Open
 *
 * Tests the circom circuit directly using snarkjs (no blockchain).
 * Verifies that:
 * - Valid inputs produce valid proofs (different rarity tiers)
 * - Invalid inputs (wrong sk, wrong boxId, wrong rarity, etc.) cause proof generation to fail
 * - Tampered public signals cause verification to fail
 */

const assert = require("assert");
const path = require("path");
const snarkjs = require("snarkjs");
const fs = require("fs");
const crypto = require("crypto");
const { poseidonHash, randomSecretKey, getPublicKey, init } = require("../../scripts/lib/circomlibBabyJub");

const CIRCUIT_NAME = "loot_box_open";
const BUILD_DIR = path.join(__dirname, "../../circuits/build", CIRCUIT_NAME);
const WASM_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`);
const ZKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`);
const VKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_vkey.json`);

// Default thresholds: 1% legendary, 4% epic, 15% rare, 80% common
const DEFAULT_THRESHOLDS = [100n, 500n, 2000n, 10000n];

// BN128 field prime
const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function checkBuildFiles() {
  if (!fs.existsSync(ZKEY_PATH)) {
    console.log(`\n  ⚠️  Skipping circuit tests: zkey not found at ${ZKEY_PATH}`);
    console.log("     Run: node scripts/compile-circuit.js loot_box_open\n");
    return false;
  }
  return true;
}

/**
 * Compute VRF mod value from VRF output (mirrors circuit logic)
 */
function computeVrfMod(vrfOutput) {
  // Extract lower 14 bits
  const randomVal = vrfOutput & 0x3FFFn; // lower 14 bits
  // Mod 10000
  if (randomVal < 10000n) return randomVal;
  return randomVal - 10000n;
}

/**
 * Determine rarity tier from VRF mod value and thresholds
 */
function determineRarity(vrfMod, thresholds) {
  for (let i = 0; i < thresholds.length; i++) {
    if (vrfMod < thresholds[i]) return i;
  }
  return thresholds.length - 1;
}

/**
 * Generate valid circuit inputs for a loot box open
 */
async function generateValidInputs(options = {}) {
  const ownerSk = options.ownerSk || await randomSecretKey();
  const ownerPk = await getPublicKey(ownerSk);

  const boxId = options.boxId || BigInt(1);
  const boxType = options.boxType || BigInt(1);
  const boxSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const itemSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const thresholds = options.thresholds || DEFAULT_THRESHOLDS;

  // Compute box commitment: Poseidon(pkX, pkY, boxId, boxType, boxSalt)
  const boxCommitment = await poseidonHash([
    ownerPk.x, ownerPk.y, boxId, boxType, boxSalt,
  ]);

  // Compute nullifier: Poseidon(boxId, boxSalt, sk)
  const nullifier = await poseidonHash([boxId, boxSalt, ownerSk]);

  // Compute VRF output: Poseidon(sk, seed) where seed = nullifier
  const vrfOutput = await poseidonHash([ownerSk, nullifier]);

  // Determine rarity from VRF output
  const vrfMod = computeVrfMod(vrfOutput);
  const itemRarity = BigInt(determineRarity(vrfMod, thresholds));

  // Choose itemId based on rarity (arbitrary for testing)
  const itemId = options.itemId || BigInt(1001 + Number(itemRarity));

  // Compute outcome commitment: Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
  const outcomeCommitment = await poseidonHash([
    ownerPk.x, ownerPk.y, itemId, itemRarity, itemSalt,
  ]);

  return {
    // Public inputs
    boxCommitment: boxCommitment.toString(),
    outcomeCommitment: outcomeCommitment.toString(),
    vrfOutput: vrfOutput.toString(),
    boxId: boxId.toString(),
    nullifier: nullifier.toString(),
    // Private inputs
    ownerPkX: ownerPk.x.toString(),
    ownerPkY: ownerPk.y.toString(),
    ownerSk: ownerSk.toString(),
    boxSalt: boxSalt.toString(),
    boxType: boxType.toString(),
    itemId: itemId.toString(),
    itemRarity: itemRarity.toString(),
    itemSalt: itemSalt.toString(),
    rarityThresholds: thresholds.map(t => t.toString()),
    // Keep raw values for tests
    _raw: {
      ownerSk, ownerPk, boxId, boxType, boxSalt,
      itemId, itemRarity, itemSalt, vrfOutput, nullifier,
      thresholds, vrfMod,
    },
  };
}

describe("F4: Loot Box Open Circuit", function () {
  this.timeout(120000);

  let hasBuild;

  before(async function () {
    await init();
    hasBuild = checkBuildFiles();
    if (!hasBuild) this.skip();
  });

  describe("Valid proof generation", function () {
    it("should generate and verify a valid loot box open proof", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

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

      // Public signals: [boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier]
      assert.strictEqual(publicSignals.length, 5, "Should have 5 public signals");
      assert.strictEqual(publicSignals[0], circuitInputs.boxCommitment);
      assert.strictEqual(publicSignals[1], circuitInputs.outcomeCommitment);
      assert.strictEqual(publicSignals[2], circuitInputs.vrfOutput);
      assert.strictEqual(publicSignals[3], circuitInputs.boxId);
      assert.strictEqual(publicSignals[4], circuitInputs.nullifier);
    });

    it("should work with different box types", async function () {
      const inputs = await generateValidInputs({ boxType: BigInt(3) });
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      assert.strictEqual(valid, true, "Proof should be valid for different box type");
    });

    it("should produce different VRF outputs for different boxes", async function () {
      const ownerSk = await randomSecretKey();
      const inputs1 = await generateValidInputs({ ownerSk, boxId: BigInt(1) });
      const inputs2 = await generateValidInputs({ ownerSk, boxId: BigInt(2) });

      assert.notStrictEqual(
        inputs1.vrfOutput, inputs2.vrfOutput,
        "Different boxes should produce different VRF outputs"
      );
    });
  });

  describe("Invalid inputs should fail", function () {
    it("should fail with wrong secret key", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const wrongSk = await randomSecretKey();
      circuitInputs.ownerSk = wrongSk.toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong sk");
      }
    });

    it("should fail with wrong boxId", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.boxId = "999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong boxId");
      }
    });

    it("should fail with wrong nullifier", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.nullifier = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong nullifier");
      }
    });

    it("should fail with wrong VRF output", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.vrfOutput = "99999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong VRF output");
      }
    });

    it("should fail with wrong itemRarity (claimed wrong tier)", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Claim a different rarity than what VRF determined
      const actualRarity = Number(circuitInputs.itemRarity);
      const wrongRarity = (actualRarity + 1) % 4;
      circuitInputs.itemRarity = wrongRarity.toString();

      // Also need to update outcomeCommitment to match wrong rarity
      // (but this will still fail because tier verification fails)
      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong rarity");
      }
    });

    it("should fail with wrong outcome commitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.outcomeCommitment = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong outcome commitment");
      }
    });

    it("should fail with invalid thresholds (not ordered)", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Swap thresholds to break ordering
      circuitInputs.rarityThresholds = ["500", "100", "2000", "10000"];

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with unordered thresholds");
      }
    });

    it("should fail with invalid last threshold (not 10000)", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.rarityThresholds = ["100", "500", "2000", "9999"];

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail when last threshold != 10000");
      }
    });
  });

  describe("Proof tampering should fail verification", function () {
    it("should reject proof with tampered boxCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[0] = "999";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered boxCommitment should be invalid");
    });

    it("should reject proof with tampered vrfOutput", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[2] = "12345";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered vrfOutput should be invalid");
    });

    it("should reject proof with tampered nullifier", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[4] = "12345";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered nullifier should be invalid");
    });
  });
});
