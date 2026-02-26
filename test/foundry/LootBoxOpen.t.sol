// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/LootBoxOpen.sol";
import "../../contracts/test/MockLootBoxVerifier.sol";
import "../../contracts/test/MockERC20.sol";

contract LootBoxOpenTest is Test {
    LootBoxOpen public lootBoxOpen;
    MockLootBoxVerifier public mockVerifier;
    MockERC20 public token;

    address public user = address(0x10);

    uint256 public constant BOX_PRICE = 10 ether;
    uint256 public constant BOX_TYPE  = 1;
    bytes   public constant ENC_NOTE  = "encrypted-data";

    // Groth16 dummy proof (mock always returns true)
    uint256[2]    internal a = [uint256(0), uint256(0)];
    uint256[2][2] internal b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
    uint256[2]    internal c = [uint256(0), uint256(0)];

    event BoxRegistered(uint256 indexed boxId, bytes32 noteHash);
    event BoxOpened(bytes32 indexed boxCommitment, bytes32 indexed outcomeCommitment, bytes32 nullifier, uint256 vrfOutput);
    event BoxMinted(address indexed buyer, uint256 indexed boxId, uint256 boxType);
    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);
    event NoteSpent(bytes32 indexed noteHash, bytes32 indexed nullifier);

    function setUp() public {
        mockVerifier = new MockLootBoxVerifier();
        token = new MockERC20();
        lootBoxOpen = new LootBoxOpen(address(mockVerifier), address(token), BOX_PRICE);

        // Fund user with tokens
        token.mint(user, BOX_PRICE * 100);
    }

    /// @dev Mint a new box as `user`. Returns the assigned boxId.
    function _mintBox() internal returns (uint256 boxId) {
        vm.startPrank(user);
        token.approve(address(lootBoxOpen), BOX_PRICE);
        boxId = lootBoxOpen.mintBox(BOX_TYPE);
        vm.stopPrank();
    }

    /// @dev Mint + register a box as `user`. Returns boxId.
    function _mintAndRegister(bytes32 noteHash) internal returns (uint256 boxId) {
        boxId = _mintBox();
        vm.prank(user);
        lootBoxOpen.registerBox(noteHash, boxId, ENC_NOTE);
    }

    // ========================
    //  mintBox
    // ========================

    function test_MintBox() public {
        uint256 boxId = _mintBox();

        assertEq(boxId, 1);
        (address owner, uint256 boxType, bool registered) = lootBoxOpen.getBoxInfo(boxId);
        assertEq(owner, user);
        assertEq(boxType, BOX_TYPE);
        assertFalse(registered);
        assertEq(token.balanceOf(address(lootBoxOpen)), BOX_PRICE);
    }

    function test_MintBox_EmitsEvent() public {
        vm.startPrank(user);
        token.approve(address(lootBoxOpen), BOX_PRICE);

        vm.expectEmit(true, true, false, true);
        emit BoxMinted(user, 1, BOX_TYPE);

        lootBoxOpen.mintBox(BOX_TYPE);
        vm.stopPrank();
    }

    // ========================
    //  registerBox
    // ========================

    function test_RegisterBox() public {
        bytes32 noteHash = keccak256("box-1");

        uint256 boxId = _mintAndRegister(noteHash);

        assertEq(uint256(lootBoxOpen.getNoteState(noteHash)), 1); // Valid
        assertTrue(lootBoxOpen.registeredBoxes(boxId));
    }

    function test_RegisterBox_EmitsEvent() public {
        bytes32 noteHash = keccak256("box-evt");
        uint256 boxId = _mintBox();

        vm.prank(user);
        vm.expectEmit(true, false, false, true);
        emit BoxRegistered(boxId, noteHash);

        lootBoxOpen.registerBox(noteHash, boxId, ENC_NOTE);
    }

    function test_RegisterBox_EmitsNoteCreated() public {
        bytes32 noteHash = keccak256("box-note-created");
        uint256 boxId = _mintBox();

        vm.prank(user);
        vm.expectEmit(true, false, false, true);
        emit NoteCreated(noteHash, ENC_NOTE);

        lootBoxOpen.registerBox(noteHash, boxId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateBoxRegistration() public {
        bytes32 noteHash = keccak256("box-dup");
        uint256 boxId = _mintAndRegister(noteHash);

        vm.prank(user);
        vm.expectRevert("Box already registered");
        lootBoxOpen.registerBox(keccak256("box-dup-2"), boxId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateNoteHash() public {
        bytes32 noteHash = keccak256("same-box-hash");

        // Register two distinct boxes with the same noteHash
        _mintAndRegister(noteHash);
        uint256 boxId2 = _mintBox();

        vm.prank(user);
        vm.expectRevert("Note already exists");
        lootBoxOpen.registerBox(noteHash, boxId2, ENC_NOTE);
    }

    function test_RevertWhen_RegisterBox_NotOwner() public {
        uint256 boxId = _mintBox();

        // Different caller attempts to register
        vm.prank(address(0x99));
        vm.expectRevert("Not box owner");
        lootBoxOpen.registerBox(keccak256("steal"), boxId, ENC_NOTE);
    }

    function testFuzz_RegisterBox(bytes32 noteHash) public {
        vm.assume(noteHash != bytes32(0));

        uint256 boxId = _mintAndRegister(noteHash);

        assertEq(uint256(lootBoxOpen.getNoteState(noteHash)), 1);
        assertTrue(lootBoxOpen.registeredBoxes(boxId));
    }

    // ========================
    //  openBox
    // ========================

    function test_OpenBox() public {
        bytes32 boxHash     = keccak256("sealed-box");
        bytes32 outcomeHash = keccak256("outcome-item");
        bytes32 nullifier   = keccak256("null-open");
        uint256 vrfOutput   = 42;

        uint256 boxId = _mintAndRegister(boxHash);

        lootBoxOpen.openBox(
            a, b, c,
            boxHash, outcomeHash, vrfOutput, boxId, nullifier, ENC_NOTE
        );

        assertEq(uint256(lootBoxOpen.getNoteState(boxHash)), 2);    // Spent
        assertEq(uint256(lootBoxOpen.getNoteState(outcomeHash)), 1); // Valid
        assertTrue(lootBoxOpen.isNullifierUsed(nullifier));
    }

    function test_OpenBox_EmitsEvents() public {
        bytes32 boxHash     = keccak256("box-open-evt");
        bytes32 outcomeHash = keccak256("outcome-evt");
        bytes32 nullifier   = keccak256("null-open-evt");
        uint256 vrfOutput   = 42;

        uint256 boxId = _mintAndRegister(boxHash);

        vm.expectEmit(true, true, false, true);
        emit NoteSpent(boxHash, nullifier);

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(outcomeHash, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit BoxOpened(boxHash, outcomeHash, nullifier, vrfOutput);

        lootBoxOpen.openBox(
            a, b, c,
            boxHash, outcomeHash, vrfOutput, boxId, nullifier, ENC_NOTE
        );
    }

    function test_OpenMultipleBoxes() public {
        bytes32 box1  = keccak256("box-multi-1");
        bytes32 box2  = keccak256("box-multi-2");
        bytes32 out1  = keccak256("out-multi-1");
        bytes32 out2  = keccak256("out-multi-2");
        bytes32 null1 = keccak256("null-multi-1");
        bytes32 null2 = keccak256("null-multi-2");

        uint256 boxId1 = _mintAndRegister(box1);
        uint256 boxId2 = _mintAndRegister(box2);

        lootBoxOpen.openBox(a, b, c, box1, out1, 42, boxId1, null1, ENC_NOTE);
        assertEq(uint256(lootBoxOpen.getNoteState(box1)), 2);
        assertEq(uint256(lootBoxOpen.getNoteState(out1)), 1);

        lootBoxOpen.openBox(a, b, c, box2, out2, 99, boxId2, null2, ENC_NOTE);
        assertEq(uint256(lootBoxOpen.getNoteState(box2)), 2);
        assertEq(uint256(lootBoxOpen.getNoteState(out2)), 1);
    }

    // ========================
    //  Rejection cases
    // ========================

    function test_RevertWhen_DoubleOpen() public {
        bytes32 boxHash      = keccak256("box-ds");
        bytes32 outcomeHash1 = keccak256("out-ds-1");
        bytes32 outcomeHash2 = keccak256("out-ds-2");
        bytes32 nullifier    = keccak256("null-ds");

        uint256 boxId = _mintAndRegister(boxHash);
        lootBoxOpen.openBox(a, b, c, boxHash, outcomeHash1, 42, boxId, nullifier, ENC_NOTE);

        vm.expectRevert("Nullifier already used");
        lootBoxOpen.openBox(a, b, c, outcomeHash1, outcomeHash2, 42, boxId, nullifier, ENC_NOTE);
    }

    function test_RevertWhen_SpentBox() public {
        bytes32 boxHash     = keccak256("box-spent");
        bytes32 outcomeHash = keccak256("out-spent");
        bytes32 null1       = keccak256("null-spent-1");
        bytes32 null2       = keccak256("null-spent-2");

        uint256 boxId = _mintAndRegister(boxHash);
        lootBoxOpen.openBox(a, b, c, boxHash, outcomeHash, 42, boxId, null1, ENC_NOTE);

        vm.expectRevert("Note does not exist or already spent");
        lootBoxOpen.openBox(a, b, c, boxHash, keccak256("x"), 42, boxId, null2, ENC_NOTE);
    }

    function test_RevertWhen_NonExistentBox() public {
        bytes32 fakeHash    = keccak256("nonexistent");
        bytes32 outcomeHash = keccak256("out-fake");
        bytes32 nullifier   = keccak256("null-fake");

        vm.expectRevert("Note does not exist or already spent");
        lootBoxOpen.openBox(a, b, c, fakeHash, outcomeHash, 42, 1, nullifier, ENC_NOTE);
    }

    // ========================
    //  Admin functions
    // ========================

    function test_SetBoxPrice() public {
        uint256 newPrice = 20 ether;
        lootBoxOpen.setBoxPrice(newPrice);
        assertEq(lootBoxOpen.boxPrice(), newPrice);
    }

    function test_WithdrawTokens() public {
        _mintBox(); // adds BOX_PRICE to contract balance

        uint256 adminBalanceBefore = token.balanceOf(address(this));
        lootBoxOpen.withdrawTokens(address(this));

        assertEq(token.balanceOf(address(this)), adminBalanceBefore + BOX_PRICE);
        assertEq(token.balanceOf(address(lootBoxOpen)), 0);
    }

    // ========================
    //  View functions
    // ========================

    function test_GetNoteState_Invalid() public view {
        assertEq(uint256(lootBoxOpen.getNoteState(keccak256("random"))), 0);
    }

    function test_IsNullifierUsed_False() public view {
        assertFalse(lootBoxOpen.isNullifierUsed(keccak256("unused")));
    }

    // ========================
    //  Fuzz: open flow
    // ========================

    function testFuzz_OpenBox(
        bytes32 boxHash,
        bytes32 outcomeHash,
        uint256 vrfOutput,
        bytes32 nullifier
    ) public {
        vm.assume(boxHash != outcomeHash);
        vm.assume(boxHash != bytes32(0));
        vm.assume(outcomeHash != bytes32(0));
        vm.assume(nullifier != bytes32(0));

        uint256 boxId = _mintAndRegister(boxHash);

        lootBoxOpen.openBox(
            a, b, c,
            boxHash, outcomeHash, vrfOutput, boxId, nullifier, ENC_NOTE
        );

        assertEq(uint256(lootBoxOpen.getNoteState(boxHash)), 2);
        assertEq(uint256(lootBoxOpen.getNoteState(outcomeHash)), 1);
        assertTrue(lootBoxOpen.isNullifierUsed(nullifier));
    }
}
