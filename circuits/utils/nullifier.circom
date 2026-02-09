pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

// Compute nullifier for preventing double-spend
// nullifier = Poseidon(itemId, salt, sk)
template ComputeNullifier() {
    signal input itemId;
    signal input salt;
    signal input sk;
    signal output out;

    component hash = Poseidon(3);
    hash.inputs[0] <== itemId;
    hash.inputs[1] <== salt;
    hash.inputs[2] <== sk;

    out <== hash.out;
}
