/**
 * Circuit-level unit tests for F5: Gaming Item Trade
 *
 * Tests the circom circuit directly using snarkjs (no blockchain).
 * Verifies that:
 * - Valid inputs produce valid proofs (paid trade and gift)
 * - Invalid inputs (wrong sk, wrong itemId, wrong gameId, etc.) cause proof generation to fail
 * - Tampered public signals cause verification to fail
 */

const assert = require("assert");
const path = require("path");
const snarkjs = require("snarkjs");
const fs = require("fs");
const crypto = require("crypto");
const { poseidonHash, randomSecretKey, getPublicKey, init } = require("../../scripts/lib/circomlibBabyJub");

const CIRCUIT_NAME = "gaming_item_trade";
const BUILD_DIR = path.join(__dirname, "../../circuits/build", CIRCUIT_NAME);
const WASM_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`);
const ZKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`);
const VKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_vkey.json`);

function checkBuildFiles() {
  if (!fs.existsSync(ZKEY_PATH)) {
    console.log(`\n  ⚠️  Skipping circuit tests: zkey not found at ${ZKEY_PATH}`);
    console.log("     Run: node scripts/compile-circuit.js gaming_item_trade\n");
    return false;
  }
  return true;
}

/**
 * Generate a valid set of circuit inputs for a paid item trade
 */
async function generateValidInputs(options = {}) {
  const sellerSk = options.sellerSk || await randomSecretKey();
  const sellerPk = await getPublicKey(sellerSk);

  const buyerSk = options.buyerSk || await randomSecretKey();
  const buyerPk = await getPublicKey(buyerSk);

  const itemId = options.itemId || BigInt(101);
  const itemType = options.itemType || BigInt(3);       // e.g., weapon=1, armor=2, potion=3
  const itemAttributes = options.itemAttributes || BigInt(9999); // e.g., encoded stats
  const gameId = options.gameId || BigInt(42);
  const price = options.price !== undefined ? BigInt(options.price) : BigInt(1000);
  const paymentToken = options.paymentToken || BigInt(1); // e.g., 1 = gold token
  const oldSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const newSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const paymentSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

  // Compute old item note hash: Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
  const oldItemHash = await poseidonHash([
    sellerPk.x, sellerPk.y, itemId, itemType, itemAttributes, gameId, oldSalt,
  ]);

  // Compute new item note hash
  const newItemHash = await poseidonHash([
    buyerPk.x, buyerPk.y, itemId, itemType, itemAttributes, gameId, newSalt,
  ]);

  // Compute nullifier: Poseidon(itemId, oldSalt, sk)
  const nullifier = await poseidonHash([itemId, oldSalt, sellerSk]);

  // Compute payment note hash: Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
  let paymentNoteHash;
  if (price === 0n) {
    paymentNoteHash = 0n;
  } else {
    paymentNoteHash = await poseidonHash([
      sellerPk.x, sellerPk.y, price, paymentToken, paymentSalt,
    ]);
  }

  return {
    // Public inputs
    oldItemHash: oldItemHash.toString(),
    newItemHash: newItemHash.toString(),
    paymentNoteHash: paymentNoteHash.toString(),
    gameId: gameId.toString(),
    nullifier: nullifier.toString(),
    // Private inputs
    sellerPkX: sellerPk.x.toString(),
    sellerPkY: sellerPk.y.toString(),
    sellerSk: sellerSk.toString(),
    oldSalt: oldSalt.toString(),
    buyerPkX: buyerPk.x.toString(),
    buyerPkY: buyerPk.y.toString(),
    newSalt: newSalt.toString(),
    itemId: itemId.toString(),
    itemType: itemType.toString(),
    itemAttributes: itemAttributes.toString(),
    price: price.toString(),
    paymentToken: paymentToken.toString(),
    paymentSalt: paymentSalt.toString(),
    // Keep raw values for tampering tests
    _raw: {
      sellerSk, sellerPk, buyerSk, buyerPk,
      itemId, itemType, itemAttributes, gameId,
      price, paymentToken, oldSalt, newSalt, paymentSalt,
    },
  };
}

describe("F5: Gaming Item Trade Circuit", function () {
  this.timeout(120000);

  let hasBuild;

  before(async function () {
    await init();
    hasBuild = checkBuildFiles();
    if (!hasBuild) this.skip();
  });

  describe("Valid proof generation", function () {
    it("should generate and verify a valid paid trade proof", async function () {
      const inputs = await generateValidInputs({ price: 1000 });
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      assert.strictEqual(valid, true, "Proof should be valid for paid trade");
    });

    it("should generate and verify a valid gift (price=0) proof", async function () {
      const inputs = await generateValidInputs({ price: 0 });
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      assert.strictEqual(valid, true, "Proof should be valid for gift trade");
    });

    it("should produce correct public signals order", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      // Public signals: [oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]
      assert.strictEqual(publicSignals.length, 5, "Should have 5 public signals");
      assert.strictEqual(publicSignals[0], circuitInputs.oldItemHash);
      assert.strictEqual(publicSignals[1], circuitInputs.newItemHash);
      assert.strictEqual(publicSignals[2], circuitInputs.paymentNoteHash);
      assert.strictEqual(publicSignals[3], circuitInputs.gameId);
      assert.strictEqual(publicSignals[4], circuitInputs.nullifier);
    });
  });

  describe("Invalid inputs should fail", function () {
    it("should fail with wrong secret key", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const wrongSk = await randomSecretKey();
      circuitInputs.sellerSk = wrongSk.toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong sk");
      }
    });

    it("should fail with wrong itemId", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.itemId = "999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong itemId");
      }
    });

    it("should fail with wrong gameId", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.gameId = "999";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong gameId");
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

    it("should fail with tampered itemAttributes", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Change itemAttributes (should break old note hash verification)
      circuitInputs.itemAttributes = "1111";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with tampered itemAttributes");
      }
    });

    it("should fail with wrong payment hash (paid trade with wrong price)", async function () {
      const inputs = await generateValidInputs({ price: 1000 });
      const { _raw, ...circuitInputs } = inputs;

      // Change price but keep old paymentNoteHash
      circuitInputs.price = "500";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong payment hash");
      }
    });

    it("should fail when gift trade has non-zero paymentNoteHash", async function () {
      const inputs = await generateValidInputs({ price: 0 });
      const { _raw, ...circuitInputs } = inputs;

      // Set a non-zero payment hash for a gift
      circuitInputs.paymentNoteHash = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail when gift has non-zero paymentNoteHash");
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

      // Tamper with gameId
      const tamperedSignals = [...publicSignals];
      tamperedSignals[3] = "999";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered proof should be invalid");
    });

    it("should reject proof with tampered nullifier", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      // Tamper with nullifier
      const tamperedSignals = [...publicSignals];
      tamperedSignals[4] = "12345";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered nullifier should be invalid");
    });
  });
});
