// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NFTNoteBase
 * @dev Base contract for ZK NFT note management.
 *      Manages note states and nullifier tracking for private NFT operations.
 */
contract NFTNoteBase {
    enum NoteState { Invalid, Valid, Spent }

    // note hash => state
    mapping(bytes32 => NoteState) public notes;

    // nullifier => used
    mapping(bytes32 => bool) public nullifiers;

    // Encrypted note storage (ECDH encrypted)
    mapping(bytes32 => bytes) public encryptedNotes;

    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);
    event NoteSpent(bytes32 indexed noteHash, bytes32 indexed nullifier);

    modifier noteExists(bytes32 noteHash) {
        require(notes[noteHash] == NoteState.Valid, "Note does not exist or already spent");
        _;
    }

    modifier nullifierNotUsed(bytes32 nullifier) {
        require(!nullifiers[nullifier], "Nullifier already used");
        _;
    }

    function _createNote(bytes32 noteHash, bytes memory encryptedNote) internal {
        require(notes[noteHash] == NoteState.Invalid, "Note already exists");
        notes[noteHash] = NoteState.Valid;
        encryptedNotes[noteHash] = encryptedNote;
        emit NoteCreated(noteHash, encryptedNote);
    }

    function _spendNote(bytes32 noteHash, bytes32 nullifier) internal {
        require(notes[noteHash] == NoteState.Valid, "Note not valid");
        require(!nullifiers[nullifier], "Nullifier already used");
        notes[noteHash] = NoteState.Spent;
        nullifiers[nullifier] = true;
        emit NoteSpent(noteHash, nullifier);
    }

    function getNoteState(bytes32 noteHash) external view returns (NoteState) {
        return notes[noteHash];
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }
}
