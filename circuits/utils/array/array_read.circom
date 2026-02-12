pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/comparators.circom";

// Read a value from an array at a variable index
// Uses N IsEqual comparisons to select the correct element
//
// Constraints: ~4*N (N IsEqual + N multiplications)
template ArrayRead(N) {
    signal input arr[N];
    signal input index;
    signal output out;

    component eq[N];
    signal products[N];

    var sum = 0;
    for (var i = 0; i < N; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== index;
        eq[i].in[1] <== i;
        products[i] <== eq[i].out * arr[i];
        sum += products[i];
    }

    out <== sum;
}
