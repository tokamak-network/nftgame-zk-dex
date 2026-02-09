// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";

/**
 * @title PrivateNFT
 * @dev F1: Private NFT Transfer - Privately transfer NFT ownership
 *      with on-chain provenance verification and double-spend prevention.
 *
 *      NFT Note structure: Poseidon(pkX, pkY, nftId, collectionAddress, salt)
 */
contract PrivateNFT is NFTNoteBase {
    INFTTransferVerifier public transferVerifier;

    // Collection address => nftId => registered
    mapping(address => mapping(uint256 => bool)) public registeredNFTs;

    event NFTRegistered(address indexed collection, uint256 indexed nftId, bytes32 noteHash);
    event NFTTransferred(bytes32 indexed oldNoteHash, bytes32 indexed newNoteHash, bytes32 nullifier);

    constructor(address _transferVerifier) {
        transferVerifier = INFTTransferVerifier(_transferVerifier);
    }

    /**
     * @dev Register an NFT into the private system.
     *      In production, this would lock the actual ERC-721 in escrow.
     * @param noteHash The commitment to the new private NFT note
     * @param collection The NFT collection address
     * @param nftId The NFT token ID
     * @param encryptedNote ECDH-encrypted note data for the owner
     */
    function registerNFT(
        bytes32 noteHash,
        address collection,
        uint256 nftId,
        bytes memory encryptedNote
    ) external {
        require(!registeredNFTs[collection][nftId], "NFT already registered");
        registeredNFTs[collection][nftId] = true;
        _createNote(noteHash, encryptedNote);
        emit NFTRegistered(collection, nftId, noteHash);
    }

    /**
     * @dev Transfer an NFT privately using a ZK proof.
     * @param a Groth16 proof point a
     * @param b Groth16 proof point b
     * @param c Groth16 proof point c
     * @param oldNftHash Current NFT note hash
     * @param newNftHash New NFT note hash (new owner)
     * @param nftId The NFT token ID
     * @param collectionAddress The NFT collection address
     * @param nullifier Nullifier to prevent double-spend
     * @param encryptedNote ECDH-encrypted note data for the new owner
     */
    function transferNFT(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 oldNftHash,
        bytes32 newNftHash,
        uint256 nftId,
        address collectionAddress,
        bytes32 nullifier,
        bytes memory encryptedNote
    ) external noteExists(oldNftHash) nullifierNotUsed(nullifier) {
        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(oldNftHash),
            uint256(newNftHash),
            nftId,
            uint256(uint160(collectionAddress)),
            uint256(nullifier)
        ];

        require(
            transferVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid transfer proof"
        );

        // Spend old note, create new note
        _spendNote(oldNftHash, nullifier);
        _createNote(newNftHash, encryptedNote);

        emit NFTTransferred(oldNftHash, newNftHash, nullifier);
    }
}
