// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGroth16Verifier
 * @dev Interfaces for Groth16 zk-SNARK verifier contracts.
 *      Each circuit has a specific interface with the appropriate number of public inputs.
 */

// PrivateNFTTransfer: 5 public inputs [oldNftHash, newNftHash, nftId, collectionAddress, nullifier]
interface INFTTransferVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}

// GamingItemTrade: 5 public inputs [oldItemHash, newItemHash, paymentNoteHash, gameId, nullifier]
interface IGamingItemTradeVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[5] memory input
    ) external view returns (bool);
}
