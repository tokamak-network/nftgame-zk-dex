// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";

/**
 * @title GamingItemTrade
 * @dev F5: Gaming Item Trade - Privately trade gaming items between players
 *      with payment support and game ecosystem isolation.
 *
 *      Item Note structure: Poseidon(pkX, pkY, itemId, itemType, itemAttributes, gameId, salt)
 *      Payment Note structure: Poseidon(sellerPkX, sellerPkY, price, paymentToken, paymentSalt)
 */
contract GamingItemTrade is NFTNoteBase {
    IGamingItemTradeVerifier public tradeVerifier;

    // gameId => itemId => registered
    mapping(uint256 => mapping(uint256 => bool)) public registeredItems;

    event ItemRegistered(uint256 indexed gameId, uint256 indexed itemId, bytes32 noteHash);
    event ItemTraded(bytes32 indexed oldItemHash, bytes32 indexed newItemHash, bytes32 nullifier);

    constructor(address _tradeVerifier) {
        tradeVerifier = IGamingItemTradeVerifier(_tradeVerifier);
    }

    /**
     * @dev Register a gaming item into the private trading system.
     * @param noteHash The commitment to the item note
     * @param gameId The game ecosystem identifier
     * @param itemId The item token ID
     * @param encryptedNote ECDH-encrypted note data for the owner
     */
    function registerItem(
        bytes32 noteHash,
        uint256 gameId,
        uint256 itemId,
        bytes memory encryptedNote
    ) external {
        require(!registeredItems[gameId][itemId], "Item already registered");
        registeredItems[gameId][itemId] = true;
        _createNote(noteHash, encryptedNote);
        emit ItemRegistered(gameId, itemId, noteHash);
    }

    /**
     * @dev Trade a gaming item privately using a ZK proof.
     * @param a Groth16 proof point a
     * @param b Groth16 proof point b
     * @param c Groth16 proof point c
     * @param oldItemHash Current item note hash
     * @param newItemHash New item note hash (new owner)
     * @param paymentNoteHash Payment note hash (0 for gifts)
     * @param gameId The game ecosystem identifier
     * @param nullifier Nullifier to prevent double-spend
     * @param encryptedNote ECDH-encrypted note data for the new owner
     */
    function tradeItem(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 oldItemHash,
        bytes32 newItemHash,
        bytes32 paymentNoteHash,
        uint256 gameId,
        bytes32 nullifier,
        bytes memory encryptedNote
    ) external noteExists(oldItemHash) nullifierNotUsed(nullifier) {
        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(oldItemHash),
            uint256(newItemHash),
            uint256(paymentNoteHash),
            gameId,
            uint256(nullifier)
        ];

        require(
            tradeVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid trade proof"
        );

        // Spend old note, create new note
        _spendNote(oldItemHash, nullifier);
        _createNote(newItemHash, encryptedNote);

        emit ItemTraded(oldItemHash, newItemHash, nullifier);
    }
}
