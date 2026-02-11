// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/PrivateNFT.sol";
import "../../contracts/test/MockNFTTransferVerifier.sol";

contract PrivateNFTTest is Test {
    PrivateNFT public privateNFT;
    MockNFTTransferVerifier public mockVerifier;

    address public constant COLLECTION = address(0x1);
    bytes public constant ENC_NOTE = "encrypted-data";

    // Groth16 dummy proof (mock always returns true)
    uint256[2] internal a = [uint256(0), uint256(0)];
    uint256[2][2] internal b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
    uint256[2] internal c = [uint256(0), uint256(0)];

    event NFTRegistered(address indexed collection, uint256 indexed nftId, bytes32 noteHash);
    event NFTTransferred(bytes32 indexed oldNoteHash, bytes32 indexed newNoteHash, bytes32 nullifier);
    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);
    event NoteSpent(bytes32 indexed noteHash, bytes32 indexed nullifier);

    function setUp() public {
        mockVerifier = new MockNFTTransferVerifier();
        privateNFT = new PrivateNFT(address(mockVerifier));
    }

    // ========================
    //  registerNFT
    // ========================

    function test_RegisterNFT() public {
        bytes32 noteHash = keccak256("note-1");
        uint256 nftId = 1;

        privateNFT.registerNFT(noteHash, COLLECTION, nftId, ENC_NOTE);

        assertEq(uint256(privateNFT.getNoteState(noteHash)), 1); // Valid
        assertTrue(privateNFT.registeredNFTs(COLLECTION, nftId));
    }

    function test_RegisterNFT_EmitsEvent() public {
        bytes32 noteHash = keccak256("note-evt");
        uint256 nftId = 10;

        vm.expectEmit(true, true, false, true);
        emit NFTRegistered(COLLECTION, nftId, noteHash);

        privateNFT.registerNFT(noteHash, COLLECTION, nftId, ENC_NOTE);
    }

    function test_RegisterNFT_EmitsNoteCreated() public {
        bytes32 noteHash = keccak256("note-created");
        uint256 nftId = 11;

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(noteHash, ENC_NOTE);

        privateNFT.registerNFT(noteHash, COLLECTION, nftId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateNFTRegistration() public {
        bytes32 noteHash = keccak256("note-dup");
        uint256 nftId = 2;

        privateNFT.registerNFT(noteHash, COLLECTION, nftId, ENC_NOTE);

        vm.expectRevert("NFT already registered");
        privateNFT.registerNFT(keccak256("note-dup-2"), COLLECTION, nftId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateNoteHash() public {
        bytes32 noteHash = keccak256("same-hash");

        privateNFT.registerNFT(noteHash, COLLECTION, 1, ENC_NOTE);

        vm.expectRevert("Note already exists");
        privateNFT.registerNFT(noteHash, address(0x2), 999, ENC_NOTE);
    }

    function testFuzz_RegisterNFT(bytes32 noteHash, uint256 nftId) public {
        vm.assume(noteHash != bytes32(0));

        privateNFT.registerNFT(noteHash, COLLECTION, nftId, ENC_NOTE);

        assertEq(uint256(privateNFT.getNoteState(noteHash)), 1);
        assertTrue(privateNFT.registeredNFTs(COLLECTION, nftId));
    }

    // ========================
    //  transferNFT
    // ========================

    function test_TransferNFT() public {
        bytes32 oldHash = keccak256("old");
        bytes32 newHash = keccak256("new");
        bytes32 nullifier = keccak256("null-1");
        uint256 nftId = 1;

        privateNFT.registerNFT(oldHash, COLLECTION, nftId, ENC_NOTE);

        privateNFT.transferNFT(
            a, b, c,
            oldHash, newHash, nftId, COLLECTION, nullifier, ENC_NOTE
        );

        assertEq(uint256(privateNFT.getNoteState(oldHash)), 2); // Spent
        assertEq(uint256(privateNFT.getNoteState(newHash)), 1); // Valid
        assertTrue(privateNFT.isNullifierUsed(nullifier));
    }

    function test_TransferNFT_EmitsEvents() public {
        bytes32 oldHash = keccak256("old-evt");
        bytes32 newHash = keccak256("new-evt");
        bytes32 nullifier = keccak256("null-evt");
        uint256 nftId = 5;

        privateNFT.registerNFT(oldHash, COLLECTION, nftId, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit NoteSpent(oldHash, nullifier);

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(newHash, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit NFTTransferred(oldHash, newHash, nullifier);

        privateNFT.transferNFT(
            a, b, c,
            oldHash, newHash, nftId, COLLECTION, nullifier, ENC_NOTE
        );
    }

    function test_ChainedTransfer() public {
        bytes32 hashA = keccak256("A");
        bytes32 hashB = keccak256("B");
        bytes32 hashC = keccak256("C");
        bytes32 null1 = keccak256("null1");
        bytes32 null2 = keccak256("null2");
        uint256 nftId = 1;

        // Register A
        privateNFT.registerNFT(hashA, COLLECTION, nftId, ENC_NOTE);

        // A -> B
        privateNFT.transferNFT(a, b, c, hashA, hashB, nftId, COLLECTION, null1, ENC_NOTE);
        assertEq(uint256(privateNFT.getNoteState(hashA)), 2);
        assertEq(uint256(privateNFT.getNoteState(hashB)), 1);

        // B -> C
        privateNFT.transferNFT(a, b, c, hashB, hashC, nftId, COLLECTION, null2, ENC_NOTE);
        assertEq(uint256(privateNFT.getNoteState(hashB)), 2);
        assertEq(uint256(privateNFT.getNoteState(hashC)), 1);
    }

    function test_RevertWhen_DoubleSpend() public {
        bytes32 oldHash = keccak256("old-ds");
        bytes32 newHash1 = keccak256("new-ds-1");
        bytes32 newHash2 = keccak256("new-ds-2");
        bytes32 nullifier = keccak256("null-ds");
        uint256 nftId = 3;

        privateNFT.registerNFT(oldHash, COLLECTION, nftId, ENC_NOTE);
        privateNFT.transferNFT(a, b, c, oldHash, newHash1, nftId, COLLECTION, nullifier, ENC_NOTE);

        vm.expectRevert("Nullifier already used");
        privateNFT.transferNFT(a, b, c, newHash1, newHash2, nftId, COLLECTION, nullifier, ENC_NOTE);
    }

    function test_RevertWhen_SpentNote() public {
        bytes32 oldHash = keccak256("old-spent");
        bytes32 newHash = keccak256("new-spent");
        bytes32 null1 = keccak256("null-spent-1");
        bytes32 null2 = keccak256("null-spent-2");
        uint256 nftId = 4;

        privateNFT.registerNFT(oldHash, COLLECTION, nftId, ENC_NOTE);
        privateNFT.transferNFT(a, b, c, oldHash, newHash, nftId, COLLECTION, null1, ENC_NOTE);

        vm.expectRevert("Note does not exist or already spent");
        privateNFT.transferNFT(a, b, c, oldHash, keccak256("fake"), nftId, COLLECTION, null2, ENC_NOTE);
    }

    function test_RevertWhen_NonExistentNote() public {
        bytes32 fakeHash = keccak256("nonexistent");
        bytes32 newHash = keccak256("new-fake");
        bytes32 nullifier = keccak256("null-fake");

        vm.expectRevert("Note does not exist or already spent");
        privateNFT.transferNFT(a, b, c, fakeHash, newHash, 1, COLLECTION, nullifier, ENC_NOTE);
    }

    // ========================
    //  View functions
    // ========================

    function test_GetNoteState_Invalid() public view {
        assertEq(uint256(privateNFT.getNoteState(keccak256("random"))), 0); // Invalid
    }

    function test_IsNullifierUsed_False() public view {
        assertFalse(privateNFT.isNullifierUsed(keccak256("unused")));
    }
}
