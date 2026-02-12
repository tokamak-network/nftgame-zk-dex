pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

// Fisher-Yates shuffle verification circuit
//
// Verifies that a given deck ordering (verifyDeck[N]) is the correct result of
// applying the Fisher-Yates shuffle algorithm with a deterministic seed.
//
// Algorithm (for step s = 0 to N-2):
//   i = N - 1 - s                        (compile-time constant)
//   r = Poseidon(seed, s)                 (deterministic random)
//   j = extract14bits(r) % (i + 1)        (swap target)
//   swap(deck[i], deck[j])                (variable-index swap)
//
// After all swaps, deck must equal verifyDeck.
template FisherYatesShuffle(N) {
    signal input seed;
    signal input verifyDeck[N];

    // Deck state: deckState[s][k] = value at position k after step s
    signal deckState[N - 1][N];

    // Components
    component randHash[N - 1];
    component randBits[N - 1];
    component randExtract[N - 1];
    component ltCheck[N - 1];
    component muxRead[N - 1][N];
    component muxWrite[N - 1][N];

    // Intermediate signals
    signal readProducts[N - 1][N];
    signal q_val[N - 1];
    signal j_val[N - 1];
    signal q_times_div[N - 1];
    signal valAtI[N - 1];
    signal valAtJ[N - 1];

    // For the conditional swap write: we use a uniform formula for all k.
    // isI[k] = 1 if k == i (compile-time), isJ[k] = muxWrite result (run-time)
    // newVal = prev * (1 - isI) * (1 - isJ) + valAtJ * isI + valAtI * isJ
    // But since isI is compile-time, we can branch.
    //
    // For k == i: deckState[s][k] = valAtJ[s]
    // For k != i: deckState[s][k] = prev + isJ * (valAtI - prev)

    // We need diff/correction only for k != i positions
    // But since swapDiff is declared as [N-1][N], we assign 0 for k == i
    signal swapDiff[N - 1][N];
    signal swapCorrection[N - 1][N];

    for (var s = 0; s < N - 1; s++) {
        var i = N - 1 - s;
        var divisor = i + 1;

        // --- Generate deterministic random value ---
        randHash[s] = Poseidon(2);
        randHash[s].inputs[0] <== seed;
        randHash[s].inputs[1] <== s;

        // Extract lower 14 bits for modular arithmetic
        randBits[s] = Num2Bits(254);
        randBits[s].in <== randHash[s].out;

        randExtract[s] = Bits2Num(14);
        for (var b = 0; b < 14; b++) {
            randExtract[s].in[b] <== randBits[s].out[b];
        }

        // --- Compute j = randomVal % divisor ---
        q_val[s] <-- randExtract[s].out \ divisor;
        j_val[s] <-- randExtract[s].out % divisor;

        q_times_div[s] <== q_val[s] * divisor;
        randExtract[s].out === q_times_div[s] + j_val[s];

        // Constrain: 0 <= j < divisor
        ltCheck[s] = LessThan(14);
        ltCheck[s].in[0] <== j_val[s];
        ltCheck[s].in[1] <== divisor;
        ltCheck[s].out === 1;

        // --- Read value at position i (compile-time index) ---
        if (s == 0) {
            valAtI[s] <== i;
        } else {
            valAtI[s] <== deckState[s - 1][i];
        }

        // --- Read value at position j (variable index via multiplexer) ---
        for (var k = 0; k < N; k++) {
            muxRead[s][k] = IsEqual();
            muxRead[s][k].in[0] <== j_val[s];
            muxRead[s][k].in[1] <== k;

            if (s == 0) {
                readProducts[s][k] <== muxRead[s][k].out * k;
            } else {
                readProducts[s][k] <== muxRead[s][k].out * deckState[s - 1][k];
            }
        }

        var readSum = 0;
        for (var k = 0; k < N; k++) {
            readSum += readProducts[s][k];
        }
        valAtJ[s] <== readSum;

        // --- Write new deck state with swap applied ---
        for (var k = 0; k < N; k++) {
            muxWrite[s][k] = IsEqual();
            muxWrite[s][k].in[0] <== j_val[s];
            muxWrite[s][k].in[1] <== k;

            if (k == i) {
                // Position i gets value from position j
                deckState[s][k] <== valAtJ[s];
                // Assign unused signals to 0
                swapDiff[s][k] <== 0;
                swapCorrection[s][k] <== 0;
            } else {
                // For other positions: conditionally swap if k == j
                // new = prev + isJ * (valAtI - prev)
                if (s == 0) {
                    swapDiff[s][k] <== valAtI[s] - k;
                    swapCorrection[s][k] <== muxWrite[s][k].out * swapDiff[s][k];
                    deckState[s][k] <== k + swapCorrection[s][k];
                } else {
                    swapDiff[s][k] <== valAtI[s] - deckState[s - 1][k];
                    swapCorrection[s][k] <== muxWrite[s][k].out * swapDiff[s][k];
                    deckState[s][k] <== deckState[s - 1][k] + swapCorrection[s][k];
                }
            }
        }
    }

    // ===== Verify final deck matches verifyDeck =====
    for (var k = 0; k < N; k++) {
        deckState[N - 2][k] === verifyDeck[k];
    }
}
