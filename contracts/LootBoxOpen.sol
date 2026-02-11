// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NFTNoteBase.sol";
import "./verifiers/IGroth16Verifier.sol";

/**
 * @title LootBoxOpen
 * @dev F4: Loot Box Open - Verifiable random loot box opening with provably
 *      fair outcome generation using Poseidon-based VRF.
 *
 *      Box Note structure: Poseidon(pkX, pkY, boxId, boxType, boxSalt)
 *      Outcome Note structure: Poseidon(pkX, pkY, itemId, itemRarity, itemSalt)
 */
contract LootBoxOpen is NFTNoteBase {
    ILootBoxVerifier public boxVerifier;

    // boxId => registered
    mapping(uint256 => bool) public registeredBoxes;

    event BoxRegistered(uint256 indexed boxId, bytes32 noteHash);
    event BoxOpened(bytes32 indexed boxCommitment, bytes32 indexed outcomeCommitment, bytes32 nullifier, uint256 vrfOutput);

    constructor(address _boxVerifier) {
        boxVerifier = ILootBoxVerifier(_boxVerifier);
    }

    /**
     * @dev Register a sealed loot box into the private system.
     */
    function registerBox(
        bytes32 noteHash,
        uint256 boxId,
        bytes memory encryptedNote
    ) external {
        require(!registeredBoxes[boxId], "Box already registered");
        registeredBoxes[boxId] = true;
        _createNote(noteHash, encryptedNote);
        emit BoxRegistered(boxId, noteHash);
    }

    /**
     * @dev Open a loot box using a ZK proof with Poseidon VRF randomness.
     *      Spends the box note and creates an outcome note.
     */
    function openBox(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 boxCommitment,
        bytes32 outcomeCommitment,
        uint256 vrfOutput,
        uint256 boxId,
        bytes32 nullifier,
        bytes memory encryptedNote
    ) external noteExists(boxCommitment) nullifierNotUsed(nullifier) {
        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(boxCommitment),
            uint256(outcomeCommitment),
            vrfOutput,
            boxId,
            uint256(nullifier)
        ];

        require(
            boxVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid box opening proof"
        );

        // Spend box note, create outcome note
        _spendNote(boxCommitment, nullifier);
        _createNote(outcomeCommitment, encryptedNote);

        emit BoxOpened(boxCommitment, outcomeCommitment, nullifier, vrfOutput);
    }
}
