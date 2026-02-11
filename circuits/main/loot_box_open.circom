pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../utils/babyjubjub/proof_of_ownership.circom";
include "../utils/nullifier.circom";
include "../utils/vrf/poseidon_vrf.circom";

// F4: Loot Box Open
// Verifiable random loot box opening with provably fair outcome generation.
//
// Box Note structure: Poseidon(pkX, pkY, boxId, boxType, boxSalt)
//   - 5-input Poseidon hash
//   - boxType identifies the tier/category of loot box
//
// Outcome Note structure: Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
//   - 5-input Poseidon hash
//   - itemRarity is the determined rarity tier (0=legendary, 1=epic, 2=rare, 3=common)
//
// Poseidon VRF: output = Poseidon(sk, seed) where seed = nullifier
//   - Deterministic randomness from owner's secret key
//   - Unpredictable without knowing sk
//
// Proves:
// 1. Opener owns the box (secret key matches public key in commitment)
// 2. Box commitment matches the committed hash
// 3. Nullifier prevents double-opening
// 4. VRF output is correctly computed from owner's key
// 5. Rarity tier matches VRF result against drop rate thresholds
// 6. Outcome note is correctly formed with determined rarity
// 7. Thresholds are valid (ordered, complete coverage)

template LootBoxOpen(NUM_TIERS) {
    // ===== Public Inputs =====
    signal input boxCommitment;       // Commitment to the sealed box
    signal input outcomeCommitment;   // Commitment to the revealed item
    signal input vrfOutput;           // VRF output for transparency
    signal input boxId;               // Unique box identifier
    signal input nullifier;           // Prevents double-opening

    // ===== Private Inputs =====
    signal input ownerPkX;            // Box owner public key X
    signal input ownerPkY;            // Box owner public key Y
    signal input ownerSk;             // Owner's secret key
    signal input boxSalt;             // Randomness in box commitment
    signal input boxType;             // Type/tier of loot box
    signal input itemId;              // Resulting item from opening
    signal input itemRarity;          // Rarity tier of result (0..NUM_TIERS-1)
    signal input itemSalt;            // Randomness for outcome note

    // Drop rate thresholds (cumulative, out of 10000)
    // Example: [100, 500, 2000, 10000] = 1% legendary, 4% epic, 15% rare, 80% common
    signal input rarityThresholds[NUM_TIERS];

    // ===== 1. Verify Box Commitment =====
    // boxCommitment = Poseidon(pkX, pkY, boxId, boxType, boxSalt)
    component boxHash = Poseidon(5);
    boxHash.inputs[0] <== ownerPkX;
    boxHash.inputs[1] <== ownerPkY;
    boxHash.inputs[2] <== boxId;
    boxHash.inputs[3] <== boxType;
    boxHash.inputs[4] <== boxSalt;
    boxHash.out === boxCommitment;

    // ===== 2. Verify Ownership =====
    component ownership = ProofOfOwnership();
    ownership.pk[0] <== ownerPkX;
    ownership.pk[1] <== ownerPkY;
    ownership.sk <== ownerSk;
    ownership.valid === 1;

    // ===== 3. Compute Nullifier =====
    // nullifier = Poseidon(boxId, boxSalt, sk)
    component nullifierCalc = ComputeNullifier();
    nullifierCalc.itemId <== boxId;
    nullifierCalc.salt <== boxSalt;
    nullifierCalc.sk <== ownerSk;
    nullifierCalc.out === nullifier;

    // ===== 4. Verify Poseidon VRF =====
    // VRF output = Poseidon(sk, seed) where seed = nullifier
    // The seed is derived from box-specific data, preventing seed reuse
    component vrf = PoseidonVRF();
    vrf.sk <== ownerSk;
    vrf.seed <== nullifier;
    vrf.out === vrfOutput;

    // ===== 5. Determine Rarity from VRF Output =====
    // Extract lower 14 bits of VRF output → random value in [0, 16383]
    component vrfBits = Num2Bits(254);
    vrfBits.in <== vrfOutput;

    component randBits = Bits2Num(14);
    for (var i = 0; i < 14; i++) {
        randBits.in[i] <== vrfBits.out[i];
    }

    // Compute randomValue % 10000
    // Since randomValue ∈ [0, 16383], quotient is 0 or 1
    signal randomVal;
    randomVal <== randBits.out;

    component ltCheck = LessThan(14);
    ltCheck.in[0] <== randomVal;
    ltCheck.in[1] <== 10000;

    signal isLarge;
    isLarge <== 1 - ltCheck.out;

    signal vrfMod;
    vrfMod <== randomVal - isLarge * 10000;

    // ===== 5b. Determine tier using cumulative thresholds =====
    // Tier 0: vrfMod < thresholds[0]
    // Tier i: thresholds[i-1] <= vrfMod < thresholds[i]
    component tierLT[NUM_TIERS];
    signal cumLess[NUM_TIERS];
    signal inTier[NUM_TIERS];

    for (var i = 0; i < NUM_TIERS; i++) {
        tierLT[i] = LessThan(14);
        tierLT[i].in[0] <== vrfMod;
        tierLT[i].in[1] <== rarityThresholds[i];
        cumLess[i] <== tierLT[i].out;
    }

    // inTier[0] = cumLess[0]
    // inTier[i] = cumLess[i] - cumLess[i-1] (exactly 1 if in this tier)
    inTier[0] <== cumLess[0];
    for (var i = 1; i < NUM_TIERS; i++) {
        inTier[i] <== cumLess[i] - cumLess[i-1];
    }

    // Verify claimed itemRarity matches determined tier
    component tierEq[NUM_TIERS];
    signal tierMatch[NUM_TIERS];
    signal tierSum[NUM_TIERS + 1];
    tierSum[0] <== 0;

    for (var i = 0; i < NUM_TIERS; i++) {
        tierEq[i] = IsEqual();
        tierEq[i].in[0] <== itemRarity;
        tierEq[i].in[1] <== i;
        tierMatch[i] <== tierEq[i].out * inTier[i];
        tierSum[i + 1] <== tierSum[i] + tierMatch[i];
    }
    tierSum[NUM_TIERS] === 1;

    // ===== 6. Verify Threshold Validity =====
    // Thresholds must be strictly increasing
    component thresholdLT[NUM_TIERS - 1];
    for (var i = 0; i < NUM_TIERS - 1; i++) {
        thresholdLT[i] = LessThan(14);
        thresholdLT[i].in[0] <== rarityThresholds[i];
        thresholdLT[i].in[1] <== rarityThresholds[i + 1];
        thresholdLT[i].out === 1;
    }

    // Last threshold must be 10000 (complete probability coverage)
    rarityThresholds[NUM_TIERS - 1] === 10000;

    // ===== 7. Create Outcome Note =====
    // outcomeCommitment = Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
    component outcomeNote = Poseidon(5);
    outcomeNote.inputs[0] <== ownerPkX;
    outcomeNote.inputs[1] <== ownerPkY;
    outcomeNote.inputs[2] <== itemId;
    outcomeNote.inputs[3] <== itemRarity;
    outcomeNote.inputs[4] <== itemSalt;
    outcomeNote.out === outcomeCommitment;
}

// 4 rarity tiers: 0=legendary, 1=epic, 2=rare, 3=common
component main {public [boxCommitment, outcomeCommitment, vrfOutput, boxId, nullifier]} =
    LootBoxOpen(4);
