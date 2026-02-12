pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

// Compute a commitment to a full deck of N cards using recursive Poseidon chain
//
// Chain: h[0] = cards[0]
//        h[i] = Poseidon(h[i-1], cards[i])  for i = 1..N-1
//        out  = Poseidon(h[N-1], salt)
//
// Constraints: N * ~300 (N Poseidon(2) hashes)
template DeckCommitment(N) {
    signal input cards[N];
    signal input salt;
    signal output out;

    component chain[N]; // chain[0] unused but allocated for uniform indexing

    // h[0] = Poseidon(cards[0], cards[1])
    chain[0] = Poseidon(2);
    chain[0].inputs[0] <== cards[0];
    chain[0].inputs[1] <== cards[1];

    // h[i] = Poseidon(h[i-1], cards[i+1]) for i = 1..N-2
    for (var i = 1; i < N - 1; i++) {
        chain[i] = Poseidon(2);
        chain[i].inputs[0] <== chain[i - 1].out;
        chain[i].inputs[1] <== cards[i + 1];
    }

    // Final: Poseidon(h[N-2], salt)
    chain[N - 1] = Poseidon(2);
    chain[N - 1].inputs[0] <== chain[N - 2].out;
    chain[N - 1].inputs[1] <== salt;

    out <== chain[N - 1].out;
}
