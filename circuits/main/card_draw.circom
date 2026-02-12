pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../utils/babyjubjub/proof_of_ownership.circom";
include "../utils/array/array_read.circom";
include "../utils/shuffle/fisher_yates.circom";
include "../utils/poseidon/deck_commitment.circom";

// F8: Card Draw Verify
//
// Full Fisher-Yates shuffle based card draw verification.
// Proves that a player correctly shuffled a deck of N cards using a
// deterministic seed and drew a specific card at a given index.
//
// Key design:
// - Deck commitment is persistent (not consumed on draw)
// - drawIndex tracks which card position to draw (0 to N-1)
// - No nullifier needed; on-chain drawIndex tracking prevents double-draws
//
// Proves:
// 1. Player owns the secret key matching their public key
// 2. Player commitment = Poseidon(pkX, pkY, gameId)
// 3. Fisher-Yates shuffle with given seed produces the claimed deck
// 4. Deck commitment = recursive Poseidon chain of shuffled deck + salt
// 5. Drawn card = deck[drawIndex]
// 6. Draw commitment = Poseidon(drawnCard, drawIndex, gameId, handSalt)
// 7. drawIndex < N and drawnCard < N (bound checks)

template CardDraw(N) {
    // ===== Public Inputs =====
    signal input deckCommitment;     // Hash commitment of the full shuffled deck
    signal input drawCommitment;     // Commitment to the drawn card
    signal input drawIndex;          // Position in deck to draw from (0 to N-1)
    signal input gameId;             // Game session identifier
    signal input playerCommitment;   // Poseidon(pkX, pkY, gameId)

    // ===== Private Inputs =====
    signal input playerPkX;          // Player BabyJubJub public key X
    signal input playerPkY;          // Player BabyJubJub public key Y
    signal input playerSk;           // Player secret key
    signal input shuffleSeed;        // Seed for Fisher-Yates shuffle
    signal input deckCards[N];       // The shuffled deck (result of shuffle)
    signal input drawnCard;          // The drawn card value
    signal input handSalt;           // Salt for draw commitment
    signal input deckSalt;           // Salt for deck commitment

    // ===== 1. Verify Player Ownership =====
    component ownership = ProofOfOwnership();
    ownership.pk[0] <== playerPkX;
    ownership.pk[1] <== playerPkY;
    ownership.sk <== playerSk;
    ownership.valid === 1;

    // ===== 2. Verify Player Commitment =====
    // playerCommitment = Poseidon(pkX, pkY, gameId)
    component playerHash = Poseidon(3);
    playerHash.inputs[0] <== playerPkX;
    playerHash.inputs[1] <== playerPkY;
    playerHash.inputs[2] <== gameId;
    playerHash.out === playerCommitment;

    // ===== 3. Verify Fisher-Yates Shuffle =====
    // The shuffle circuit verifies that deckCards is the correct result
    // of applying Fisher-Yates shuffle with the given seed to [0,1,...,N-1]
    component shuffle = FisherYatesShuffle(N);
    shuffle.seed <== shuffleSeed;
    for (var i = 0; i < N; i++) {
        shuffle.verifyDeck[i] <== deckCards[i];
    }

    // ===== 4. Verify Deck Commitment =====
    // deckCommitment = DeckCommitment(deckCards, deckSalt)
    component deckHash = DeckCommitment(N);
    for (var i = 0; i < N; i++) {
        deckHash.cards[i] <== deckCards[i];
    }
    deckHash.salt <== deckSalt;
    deckHash.out === deckCommitment;

    // ===== 5. Verify Card Draw =====
    // drawnCard = deckCards[drawIndex]
    component readCard = ArrayRead(N);
    for (var i = 0; i < N; i++) {
        readCard.arr[i] <== deckCards[i];
    }
    readCard.index <== drawIndex;
    readCard.out === drawnCard;

    // ===== 6. Verify Draw Commitment =====
    // drawCommitment = Poseidon(drawnCard, drawIndex, gameId, handSalt)
    component drawHash = Poseidon(4);
    drawHash.inputs[0] <== drawnCard;
    drawHash.inputs[1] <== drawIndex;
    drawHash.inputs[2] <== gameId;
    drawHash.inputs[3] <== handSalt;
    drawHash.out === drawCommitment;

    // ===== 7. Bound Checks =====
    // drawIndex < N
    component indexBound = LessThan(6); // 2^6 = 64 > 52
    indexBound.in[0] <== drawIndex;
    indexBound.in[1] <== N;
    indexBound.out === 1;

    // drawnCard < N
    component cardBound = LessThan(6);
    cardBound.in[0] <== drawnCard;
    cardBound.in[1] <== N;
    cardBound.out === 1;
}

// Standard 52-card deck
component main {public [deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment]} =
    CardDraw(52);
