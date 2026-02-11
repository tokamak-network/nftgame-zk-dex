// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/GamingItemTrade.sol";
import "../../contracts/test/MockGamingItemTradeVerifier.sol";

contract GamingItemTradeTest is Test {
    GamingItemTrade public gamingItemTrade;
    MockGamingItemTradeVerifier public mockVerifier;

    uint256 public constant GAME_ID = 42;
    bytes public constant ENC_NOTE = "encrypted-data";

    // Groth16 dummy proof (mock always returns true)
    uint256[2] internal a = [uint256(0), uint256(0)];
    uint256[2][2] internal b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
    uint256[2] internal c = [uint256(0), uint256(0)];

    event ItemRegistered(uint256 indexed gameId, uint256 indexed itemId, bytes32 noteHash);
    event ItemTraded(bytes32 indexed oldItemHash, bytes32 indexed newItemHash, bytes32 nullifier);
    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);
    event NoteSpent(bytes32 indexed noteHash, bytes32 indexed nullifier);

    function setUp() public {
        mockVerifier = new MockGamingItemTradeVerifier();
        gamingItemTrade = new GamingItemTrade(address(mockVerifier));
    }

    // ========================
    //  registerItem
    // ========================

    function test_RegisterItem() public {
        bytes32 noteHash = keccak256("item-1");
        uint256 itemId = 101;

        gamingItemTrade.registerItem(noteHash, GAME_ID, itemId, ENC_NOTE);

        assertEq(uint256(gamingItemTrade.getNoteState(noteHash)), 1); // Valid
        assertTrue(gamingItemTrade.registeredItems(GAME_ID, itemId));
    }

    function test_RegisterItem_EmitsEvent() public {
        bytes32 noteHash = keccak256("item-evt");
        uint256 itemId = 201;

        vm.expectEmit(true, true, false, true);
        emit ItemRegistered(GAME_ID, itemId, noteHash);

        gamingItemTrade.registerItem(noteHash, GAME_ID, itemId, ENC_NOTE);
    }

    function test_RegisterItem_EmitsNoteCreated() public {
        bytes32 noteHash = keccak256("item-note-created");
        uint256 itemId = 202;

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(noteHash, ENC_NOTE);

        gamingItemTrade.registerItem(noteHash, GAME_ID, itemId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateItemRegistration() public {
        bytes32 noteHash = keccak256("item-dup");
        uint256 itemId = 102;

        gamingItemTrade.registerItem(noteHash, GAME_ID, itemId, ENC_NOTE);

        vm.expectRevert("Item already registered");
        gamingItemTrade.registerItem(keccak256("item-dup-2"), GAME_ID, itemId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateNoteHash() public {
        bytes32 noteHash = keccak256("same-item-hash");

        gamingItemTrade.registerItem(noteHash, GAME_ID, 100, ENC_NOTE);

        vm.expectRevert("Note already exists");
        gamingItemTrade.registerItem(noteHash, 999, 999, ENC_NOTE);
    }

    function test_SameItemIdDifferentGames() public {
        bytes32 hash1 = keccak256("game1-item");
        bytes32 hash2 = keccak256("game2-item");
        uint256 itemId = 101;

        gamingItemTrade.registerItem(hash1, 1, itemId, ENC_NOTE);
        gamingItemTrade.registerItem(hash2, 2, itemId, ENC_NOTE);

        assertTrue(gamingItemTrade.registeredItems(1, itemId));
        assertTrue(gamingItemTrade.registeredItems(2, itemId));
        assertEq(uint256(gamingItemTrade.getNoteState(hash1)), 1);
        assertEq(uint256(gamingItemTrade.getNoteState(hash2)), 1);
    }

    function testFuzz_RegisterItem(bytes32 noteHash, uint256 gameId, uint256 itemId) public {
        vm.assume(noteHash != bytes32(0));

        gamingItemTrade.registerItem(noteHash, gameId, itemId, ENC_NOTE);

        assertEq(uint256(gamingItemTrade.getNoteState(noteHash)), 1);
        assertTrue(gamingItemTrade.registeredItems(gameId, itemId));
    }

    // ========================
    //  tradeItem (paid)
    // ========================

    function test_TradeItem_Paid() public {
        bytes32 oldHash = keccak256("old-item");
        bytes32 newHash = keccak256("new-item");
        bytes32 paymentHash = keccak256("payment");
        bytes32 nullifier = keccak256("null-trade");
        uint256 itemId = 101;

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);

        gamingItemTrade.tradeItem(
            a, b, c,
            oldHash, newHash, paymentHash, GAME_ID, nullifier, ENC_NOTE
        );

        assertEq(uint256(gamingItemTrade.getNoteState(oldHash)), 2); // Spent
        assertEq(uint256(gamingItemTrade.getNoteState(newHash)), 1); // Valid
        assertTrue(gamingItemTrade.isNullifierUsed(nullifier));
    }

    function test_TradeItem_Gift() public {
        bytes32 oldHash = keccak256("old-gift");
        bytes32 newHash = keccak256("new-gift");
        bytes32 paymentHash = bytes32(0); // Gift: zero payment
        bytes32 nullifier = keccak256("null-gift");
        uint256 itemId = 202;

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);

        gamingItemTrade.tradeItem(
            a, b, c,
            oldHash, newHash, paymentHash, GAME_ID, nullifier, ENC_NOTE
        );

        assertEq(uint256(gamingItemTrade.getNoteState(oldHash)), 2);
        assertEq(uint256(gamingItemTrade.getNoteState(newHash)), 1);
    }

    function test_TradeItem_EmitsEvents() public {
        bytes32 oldHash = keccak256("old-trade-evt");
        bytes32 newHash = keccak256("new-trade-evt");
        bytes32 paymentHash = keccak256("pay-evt");
        bytes32 nullifier = keccak256("null-trade-evt");
        uint256 itemId = 301;

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit NoteSpent(oldHash, nullifier);

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(newHash, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit ItemTraded(oldHash, newHash, nullifier);

        gamingItemTrade.tradeItem(
            a, b, c,
            oldHash, newHash, paymentHash, GAME_ID, nullifier, ENC_NOTE
        );
    }

    function test_ChainedTrade() public {
        bytes32 hashA = keccak256("item-A");
        bytes32 hashB = keccak256("item-B");
        bytes32 hashC = keccak256("item-C");
        bytes32 pay1 = keccak256("pay-1");
        bytes32 pay2 = keccak256("pay-2");
        bytes32 null1 = keccak256("chain-null-1");
        bytes32 null2 = keccak256("chain-null-2");
        uint256 itemId = 401;

        gamingItemTrade.registerItem(hashA, GAME_ID, itemId, ENC_NOTE);

        // A -> B
        gamingItemTrade.tradeItem(a, b, c, hashA, hashB, pay1, GAME_ID, null1, ENC_NOTE);
        assertEq(uint256(gamingItemTrade.getNoteState(hashA)), 2);
        assertEq(uint256(gamingItemTrade.getNoteState(hashB)), 1);

        // B -> C
        gamingItemTrade.tradeItem(a, b, c, hashB, hashC, pay2, GAME_ID, null2, ENC_NOTE);
        assertEq(uint256(gamingItemTrade.getNoteState(hashB)), 2);
        assertEq(uint256(gamingItemTrade.getNoteState(hashC)), 1);
    }

    // ========================
    //  Rejection cases
    // ========================

    function test_RevertWhen_DoubleSpend() public {
        bytes32 oldHash = keccak256("old-ds");
        bytes32 newHash1 = keccak256("new-ds-1");
        bytes32 newHash2 = keccak256("new-ds-2");
        bytes32 paymentHash = keccak256("pay-ds");
        bytes32 nullifier = keccak256("null-ds");
        uint256 itemId = 501;

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);
        gamingItemTrade.tradeItem(a, b, c, oldHash, newHash1, paymentHash, GAME_ID, nullifier, ENC_NOTE);

        vm.expectRevert("Nullifier already used");
        gamingItemTrade.tradeItem(a, b, c, newHash1, newHash2, paymentHash, GAME_ID, nullifier, ENC_NOTE);
    }

    function test_RevertWhen_SpentNote() public {
        bytes32 oldHash = keccak256("old-spent");
        bytes32 newHash = keccak256("new-spent");
        bytes32 paymentHash = keccak256("pay-spent");
        bytes32 null1 = keccak256("null-spent-1");
        bytes32 null2 = keccak256("null-spent-2");
        uint256 itemId = 502;

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);
        gamingItemTrade.tradeItem(a, b, c, oldHash, newHash, paymentHash, GAME_ID, null1, ENC_NOTE);

        vm.expectRevert("Note does not exist or already spent");
        gamingItemTrade.tradeItem(a, b, c, oldHash, keccak256("x"), paymentHash, GAME_ID, null2, ENC_NOTE);
    }

    function test_RevertWhen_NonExistentNote() public {
        bytes32 fakeHash = keccak256("nonexistent");
        bytes32 newHash = keccak256("new-fake");
        bytes32 nullifier = keccak256("null-fake");

        vm.expectRevert("Note does not exist or already spent");
        gamingItemTrade.tradeItem(a, b, c, fakeHash, newHash, bytes32(0), GAME_ID, nullifier, ENC_NOTE);
    }

    // ========================
    //  View functions
    // ========================

    function test_GetNoteState_Invalid() public view {
        assertEq(uint256(gamingItemTrade.getNoteState(keccak256("random"))), 0);
    }

    function test_IsNullifierUsed_False() public view {
        assertFalse(gamingItemTrade.isNullifierUsed(keccak256("unused")));
    }

    // ========================
    //  Fuzz: trade flow
    // ========================

    function testFuzz_TradeItem(
        bytes32 oldHash,
        bytes32 newHash,
        bytes32 paymentHash,
        bytes32 nullifier,
        uint256 itemId
    ) public {
        // Prevent hash collisions
        vm.assume(oldHash != newHash);
        vm.assume(oldHash != bytes32(0));
        vm.assume(newHash != bytes32(0));
        vm.assume(nullifier != bytes32(0));

        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);

        gamingItemTrade.tradeItem(
            a, b, c,
            oldHash, newHash, paymentHash, GAME_ID, nullifier, ENC_NOTE
        );

        assertEq(uint256(gamingItemTrade.getNoteState(oldHash)), 2);
        assertEq(uint256(gamingItemTrade.getNoteState(newHash)), 1);
        assertTrue(gamingItemTrade.isNullifierUsed(nullifier));
    }
}
