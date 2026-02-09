pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../utils/babyjubjub/proof_of_ownership.circom";
include "../utils/nullifier.circom";

// F1: Private NFT Transfer
// Privately transfer NFT ownership with on-chain provenance verification.
//
// NFT Note structure: Poseidon(pkX, pkY, nftId, collectionAddress, salt)
//
// Proves:
// 1. Sender owns the old NFT note (secret key matches public key)
// 2. Old note hash matches the committed hash
// 3. New note is correctly formed for the new owner
// 4. Nullifier is correctly computed (prevents double-spend)
// 5. NFT identity (nftId, collectionAddress) is preserved
template PrivateNFTTransfer() {
    // ===== Public Inputs =====
    signal input oldNftHash;
    signal input newNftHash;
    signal input nftId;
    signal input collectionAddress;
    signal input nullifier;

    // ===== Private Inputs =====
    signal input oldOwnerPkX;
    signal input oldOwnerPkY;
    signal input oldOwnerSk;
    signal input oldSalt;
    signal input newOwnerPkX;
    signal input newOwnerPkY;
    signal input newSalt;

    // ===== 1. Verify Old NFT Note =====
    component oldNft = Poseidon(5);
    oldNft.inputs[0] <== oldOwnerPkX;
    oldNft.inputs[1] <== oldOwnerPkY;
    oldNft.inputs[2] <== nftId;
    oldNft.inputs[3] <== collectionAddress;
    oldNft.inputs[4] <== oldSalt;
    oldNft.out === oldNftHash;

    // ===== 2. Verify Ownership =====
    component ownership = ProofOfOwnership();
    ownership.pk[0] <== oldOwnerPkX;
    ownership.pk[1] <== oldOwnerPkY;
    ownership.sk <== oldOwnerSk;
    ownership.valid === 1;

    // ===== 3. Compute Nullifier =====
    component nullifierCalc = ComputeNullifier();
    nullifierCalc.itemId <== nftId;
    nullifierCalc.salt <== oldSalt;
    nullifierCalc.sk <== oldOwnerSk;
    nullifierCalc.out === nullifier;

    // ===== 4. Create New NFT Note =====
    component newNft = Poseidon(5);
    newNft.inputs[0] <== newOwnerPkX;
    newNft.inputs[1] <== newOwnerPkY;
    newNft.inputs[2] <== nftId;
    newNft.inputs[3] <== collectionAddress;
    newNft.inputs[4] <== newSalt;
    newNft.out === newNftHash;
}

component main {public [oldNftHash, newNftHash, nftId, collectionAddress, nullifier]} =
    PrivateNFTTransfer();
