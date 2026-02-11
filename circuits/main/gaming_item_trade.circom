pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../utils/babyjubjub/proof_of_ownership.circom";
include "../utils/nullifier.circom";

// F5: Gaming Item Trade
// Privately trade gaming items between players with payment support.
//
// Item Note structure: Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
//   - 7-input Poseidon hash
//   - itemType and itemAttributes are preserved across trades
//   - gameId binds the item to a specific game ecosystem
//
// Payment Note structure: Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
//   - 5-input Poseidon hash
//   - price = 0 means gift (free transfer)
//
// Proves:
// 1. Seller owns the old item note (secret key matches public key)
// 2. Old item note hash matches the committed hash
// 3. New item note is correctly formed for the buyer
// 4. Item identity (itemId, itemType, itemAttributes) is preserved
// 5. gameId is preserved (same game ecosystem)
// 6. Nullifier is correctly computed (prevents double-spend)
// 7. Payment note is correctly formed (if price > 0)
template GamingItemTrade() {
    // ===== Public Inputs =====
    signal input oldItemHash;        // Old item note commitment
    signal input newItemHash;        // New item note commitment
    signal input paymentNoteHash;    // Payment note commitment (or 0 if gift)
    signal input gameId;             // Game ecosystem identifier
    signal input nullifier;          // Nullifier for double-spend prevention

    // ===== Private Inputs =====
    // Old owner (seller)
    signal input sellerPkX;
    signal input sellerPkY;
    signal input sellerSk;
    signal input oldSalt;

    // New owner (buyer)
    signal input buyerPkX;
    signal input buyerPkY;
    signal input newSalt;

    // Item properties (preserved across trade)
    signal input itemId;
    signal input itemType;
    signal input itemAttributes;

    // Payment details
    signal input price;              // 0 = gift, >0 = paid trade
    signal input paymentToken;       // Token type for payment
    signal input paymentSalt;        // Salt for payment note

    // ===== 1. Verify Old Item Note =====
    component oldItem = Poseidon(7);
    oldItem.inputs[0] <== sellerPkX;
    oldItem.inputs[1] <== sellerPkY;
    oldItem.inputs[2] <== itemId;
    oldItem.inputs[3] <== itemType;
    oldItem.inputs[4] <== itemAttributes;
    oldItem.inputs[5] <== gameId;
    oldItem.inputs[6] <== oldSalt;
    oldItem.out === oldItemHash;

    // ===== 2. Verify Ownership =====
    component ownership = ProofOfOwnership();
    ownership.pk[0] <== sellerPkX;
    ownership.pk[1] <== sellerPkY;
    ownership.sk <== sellerSk;
    ownership.valid === 1;

    // ===== 3. Compute Nullifier =====
    component nullifierCalc = ComputeNullifier();
    nullifierCalc.itemId <== itemId;
    nullifierCalc.salt <== oldSalt;
    nullifierCalc.sk <== sellerSk;
    nullifierCalc.out === nullifier;

    // ===== 4. Create New Item Note (for buyer) =====
    component newItem = Poseidon(7);
    newItem.inputs[0] <== buyerPkX;
    newItem.inputs[1] <== buyerPkY;
    newItem.inputs[2] <== itemId;
    newItem.inputs[3] <== itemType;
    newItem.inputs[4] <== itemAttributes;
    newItem.inputs[5] <== gameId;
    newItem.inputs[6] <== newSalt;
    newItem.out === newItemHash;

    // ===== 5. Payment Logic =====
    // Compute the actual payment note hash
    component paymentNote = Poseidon(5);
    paymentNote.inputs[0] <== sellerPkX;
    paymentNote.inputs[1] <== sellerPkY;
    paymentNote.inputs[2] <== price;
    paymentNote.inputs[3] <== paymentToken;
    paymentNote.inputs[4] <== paymentSalt;

    // Check if price is zero (gift mode)
    component isGift = IsZero();
    isGift.in <== price;

    // If gift (price=0): paymentNoteHash must be 0
    // If paid (price>0): paymentNoteHash must equal computed hash
    //
    // paymentNoteHash === (1 - isGift.out) * paymentNote.out
    // When isGift=1 (price=0): paymentNoteHash === 0
    // When isGift=0 (price>0): paymentNoteHash === paymentNote.out
    signal expectedPaymentHash;
    expectedPaymentHash <== (1 - isGift.out) * paymentNote.out;
    paymentNoteHash === expectedPaymentHash;
}

component main {public [oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]} =
    GamingItemTrade();
