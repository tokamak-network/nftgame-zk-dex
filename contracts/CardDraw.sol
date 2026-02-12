// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";

/**
 * @title CardDraw
 * @dev F8: Card Draw Verify - Full Fisher-Yates shuffle based card draw verification.
 *
 *      Unlike F1/F4/F5, the deck commitment is NOT consumed on each draw.
 *      Instead, drawIndex is tracked on-chain to prevent double-draws.
 *
 *      Deck commitment: recursive Poseidon chain of 52 shuffled cards + salt
 *      Draw commitment: Poseidon(drawnCard, drawIndex, gameId, handSalt)
 */
contract CardDraw is NFTNoteBase {
    ICardDrawVerifier public drawVerifier;

    // gameId => deckCommitment
    mapping(uint256 => bytes32) public registeredDecks;

    // gameId => drawIndex => drawn (prevents double-draw at same index)
    mapping(uint256 => mapping(uint256 => bool)) public drawnCards;

    event DeckRegistered(uint256 indexed gameId, bytes32 deckCommitment);
    event CardDrawn(
        bytes32 indexed deckCommitment,
        bytes32 indexed drawCommitment,
        uint256 drawIndex,
        uint256 gameId,
        bytes32 playerCommitment
    );

    constructor(address _drawVerifier) {
        drawVerifier = ICardDrawVerifier(_drawVerifier);
    }

    /**
     * @dev Register a shuffled deck for a game session.
     */
    function registerDeck(
        bytes32 deckCommitment,
        uint256 gameId,
        bytes memory encryptedNote
    ) external {
        require(registeredDecks[gameId] == bytes32(0), "Deck already registered for this game");
        registeredDecks[gameId] = deckCommitment;
        _createNote(deckCommitment, encryptedNote);
        emit DeckRegistered(gameId, deckCommitment);
    }

    /**
     * @dev Draw a card from a registered deck using a ZK proof.
     *      The deck is NOT consumed; only drawIndex is marked as used.
     */
    function drawCard(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 deckCommitment,
        bytes32 drawCommitment,
        uint256 drawIndex,
        uint256 gameId,
        bytes32 playerCommitment,
        bytes memory encryptedCardNote
    ) external {
        require(registeredDecks[gameId] == deckCommitment, "Deck not registered for this game");
        require(notes[deckCommitment] == NoteState.Valid, "Deck note not valid");
        require(!drawnCards[gameId][drawIndex], "Card already drawn at this index");

        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(deckCommitment),
            uint256(drawCommitment),
            drawIndex,
            gameId,
            uint256(playerCommitment)
        ];

        require(
            drawVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid card draw proof"
        );

        // Mark draw index as used
        drawnCards[gameId][drawIndex] = true;

        // Create draw commitment note
        _createNote(drawCommitment, encryptedCardNote);

        emit CardDrawn(deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment);
    }
}
