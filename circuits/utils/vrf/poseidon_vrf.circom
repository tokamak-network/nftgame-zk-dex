pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

// Poseidon-based Verifiable Random Function (VRF)
//
// output = Poseidon(sk, seed)
//
// Security properties:
// - Deterministic: same (sk, seed) always produces same output
// - Unpredictable: output cannot be computed without knowing sk
// - Verifiable: ZK proof guarantees output was correctly computed
//
// The ZK proof separately verifies that sk corresponds to a known public key
// (via ProofOfOwnership), making the VRF output binding to the owner's identity.
//
// Reusable for:
// - F4: Loot box randomness (seed = nullifier derived from boxId)
// - F8: Card shuffle seed generation (seed = game-specific value)
template PoseidonVRF() {
    signal input sk;      // Secret key (private)
    signal input seed;    // Seed value (can be public or private)
    signal output out;    // VRF output

    component hash = Poseidon(2);
    hash.inputs[0] <== sk;
    hash.inputs[1] <== seed;

    out <== hash.out;
}
