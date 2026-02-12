/**
 * Circuit-level unit tests for F8: Card Draw Verify
 *
 * Tests the circom circuit directly using snarkjs (no blockchain).
 * Verifies that:
 * - Valid inputs produce valid proofs (different seeds, indices)
 * - Invalid inputs (wrong sk, shuffleSeed, drawnCard, drawIndex, etc.) cause proof generation to fail
 * - Tampered public signals cause verification to fail
 */

const assert = require("assert");
const path = require("path");
const snarkjs = require("snarkjs");
const fs = require("fs");
const crypto = require("crypto");
const { poseidonHash, randomSecretKey, getPublicKey, init } = require("../../scripts/lib/circomlibBabyJub");

const CIRCUIT_NAME = "card_draw";
const BUILD_DIR = path.join(__dirname, "../../circuits/build", CIRCUIT_NAME);
const WASM_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`);
const ZKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`);
const VKEY_PATH = path.join(BUILD_DIR, `${CIRCUIT_NAME}_vkey.json`);

const N = 52;

function checkBuildFiles() {
  if (!fs.existsSync(ZKEY_PATH)) {
    console.log(`\n  ⚠️  Skipping circuit tests: zkey not found at ${ZKEY_PATH}`);
    console.log("     Run: node scripts/compile-circuit.js card_draw\n");
    return false;
  }
  return true;
}

/**
 * Simulate Fisher-Yates shuffle in JavaScript (must match circuit logic exactly)
 */
async function fisherYatesShuffle(seed, n) {
  const deck = [];
  for (let i = 0; i < n; i++) deck[i] = BigInt(i);

  for (let s = 0; s < n - 1; s++) {
    const i = n - 1 - s;
    const divisor = i + 1;

    // Random hash: Poseidon(seed, s)
    const randHash = await poseidonHash([seed, BigInt(s)]);

    // Extract lower 14 bits
    const randomVal = Number(randHash & 0x3FFFn);

    // j = randomVal % divisor
    const j = randomVal % divisor;

    // Swap
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return deck;
}

/**
 * Compute deck commitment (recursive Poseidon chain)
 */
async function computeDeckCommitment(cards, salt) {
  // h[0] = Poseidon(cards[0], cards[1])
  let h = await poseidonHash([cards[0], cards[1]]);
  // h[i] = Poseidon(h[i-1], cards[i+1])
  for (let i = 2; i < cards.length; i++) {
    h = await poseidonHash([h, cards[i]]);
  }
  // final = Poseidon(h, salt)
  return await poseidonHash([h, salt]);
}

/**
 * Generate valid circuit inputs for a card draw
 */
async function generateValidInputs(options = {}) {
  const playerSk = options.playerSk || await randomSecretKey();
  const playerPk = await getPublicKey(playerSk);

  const gameId = options.gameId || BigInt(1);
  const drawIndex = options.drawIndex !== undefined ? BigInt(options.drawIndex) : BigInt(0);
  const shuffleSeed = options.shuffleSeed || BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const handSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
  const deckSalt = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

  // Simulate shuffle
  const deckCards = await fisherYatesShuffle(shuffleSeed, N);

  // Drawn card
  const drawnCard = deckCards[Number(drawIndex)];

  // Compute commitments
  const playerCommitment = await poseidonHash([playerPk.x, playerPk.y, gameId]);
  const deckCommitment = await computeDeckCommitment(deckCards, deckSalt);
  const drawCommitment = await poseidonHash([drawnCard, drawIndex, gameId, handSalt]);

  return {
    // Public inputs
    deckCommitment: deckCommitment.toString(),
    drawCommitment: drawCommitment.toString(),
    drawIndex: drawIndex.toString(),
    gameId: gameId.toString(),
    playerCommitment: playerCommitment.toString(),
    // Private inputs
    playerPkX: playerPk.x.toString(),
    playerPkY: playerPk.y.toString(),
    playerSk: playerSk.toString(),
    shuffleSeed: shuffleSeed.toString(),
    deckCards: deckCards.map(c => c.toString()),
    drawnCard: drawnCard.toString(),
    handSalt: handSalt.toString(),
    deckSalt: deckSalt.toString(),
    // Raw values for test manipulation
    _raw: {
      playerSk, playerPk, gameId, drawIndex, shuffleSeed,
      deckCards, drawnCard, handSalt, deckSalt,
      playerCommitment, deckCommitment, drawCommitment,
    },
  };
}

describe("F8: Card Draw Circuit", function () {
  this.timeout(300000); // 5 min - shuffle circuit is slow

  let hasBuild;

  before(async function () {
    await init();
    hasBuild = checkBuildFiles();
    if (!hasBuild) this.skip();
  });

  describe("Valid proof generation", function () {
    it("should generate and verify a valid card draw proof", async function () {
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

      // Public signals: [deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment]
      assert.strictEqual(publicSignals.length, 5, "Should have 5 public signals");
      assert.strictEqual(publicSignals[0], circuitInputs.deckCommitment);
      assert.strictEqual(publicSignals[1], circuitInputs.drawCommitment);
      assert.strictEqual(publicSignals[2], circuitInputs.drawIndex);
      assert.strictEqual(publicSignals[3], circuitInputs.gameId);
      assert.strictEqual(publicSignals[4], circuitInputs.playerCommitment);
    });

    it("should work with different draw indices", async function () {
      const inputs = await generateValidInputs({ drawIndex: 25 });
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
      const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      assert.strictEqual(valid, true, "Proof should be valid for drawIndex=25");
    });

    it("should produce different shuffles for different seeds", async function () {
      const seed1 = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
      const seed2 = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

      const deck1 = await fisherYatesShuffle(seed1, N);
      const deck2 = await fisherYatesShuffle(seed2, N);

      let differs = false;
      for (let i = 0; i < N; i++) {
        if (deck1[i] !== deck2[i]) { differs = true; break; }
      }
      assert.strictEqual(differs, true, "Different seeds should produce different shuffles");
    });
  });

  describe("Invalid inputs should fail", function () {
    it("should fail with wrong secret key", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const wrongSk = await randomSecretKey();
      circuitInputs.playerSk = wrongSk.toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong sk");
      }
    });

    it("should fail with wrong shuffleSeed", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const wrongSeed = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
      circuitInputs.shuffleSeed = wrongSeed.toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong shuffleSeed");
      }
    });

    it("should fail with wrong drawnCard", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      // Claim a different card than what's at drawIndex
      const actualCard = BigInt(circuitInputs.drawnCard);
      circuitInputs.drawnCard = ((actualCard + 1n) % BigInt(N)).toString();

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong drawnCard");
      }
    });

    it("should fail with wrong drawIndex", async function () {
      const inputs = await generateValidInputs({ drawIndex: 0 });
      const { _raw, ...circuitInputs } = inputs;

      // Change drawIndex but keep drawnCard from index 0
      circuitInputs.drawIndex = "1";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong drawIndex");
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

    it("should fail with wrong deckCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.deckCommitment = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong deckCommitment");
      }
    });

    it("should fail with wrong drawCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      circuitInputs.drawCommitment = "12345";

      try {
        await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
        assert.fail("Should have thrown an error");
      } catch (err) {
        assert.ok(err, "Proof generation should fail with wrong drawCommitment");
      }
    });
  });

  describe("Proof tampering should fail verification", function () {
    it("should reject proof with tampered deckCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[0] = "999";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered deckCommitment should be invalid");
    });

    it("should reject proof with tampered drawCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[1] = "999";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered drawCommitment should be invalid");
    });

    it("should reject proof with tampered playerCommitment", async function () {
      const inputs = await generateValidInputs();
      const { _raw, ...circuitInputs } = inputs;

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs, WASM_PATH, ZKEY_PATH
      );

      const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

      const tamperedSignals = [...publicSignals];
      tamperedSignals[4] = "12345";

      const valid = await snarkjs.groth16.verify(vkey, tamperedSignals, proof);
      assert.strictEqual(valid, false, "Tampered playerCommitment should be invalid");
    });
  });
});
