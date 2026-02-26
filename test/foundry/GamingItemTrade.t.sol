// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/GamingItemTrade.sol";
import "../../contracts/test/MockGamingItemTradeVerifier.sol";
import "../../contracts/test/MockERC20.sol";

contract GamingItemTradeTest is Test {
    GamingItemTrade public gamingItemTrade;
    MockGamingItemTradeVerifier public mockVerifier;
    MockERC20 public token;

    address public seller = address(0x10);
    address public buyer  = address(0x20);

    uint256 public constant GAME_ID    = 42;
    uint256 public constant ITEM_PRICE = 100 ether;
    bytes   public constant ENC_NOTE   = "encrypted-data";

    // Dummy buyer ZK pubkey
    uint256 public constant BUYER_PK_X = 123;
    uint256 public constant BUYER_PK_Y = 456;

    // Groth16 dummy proof (mock always returns true)
    uint256[2]    internal a = [uint256(0), uint256(0)];
    uint256[2][2] internal b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
    uint256[2]    internal c = [uint256(0), uint256(0)];

    event ItemRegistered(uint256 indexed gameId, uint256 indexed itemId, bytes32 noteHash);
    event ItemListed(address indexed seller, uint256 indexed listingId, uint256 price);
    event ItemPurchased(address indexed buyer, uint256 indexed listingId, uint256 buyerPkX, uint256 buyerPkY);
    event ItemTradeCompleted(uint256 indexed listingId, bytes32 oldNote, bytes32 newNote);
    event ListingCancelled(uint256 indexed listingId);
    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);
    event NoteSpent(bytes32 indexed noteHash, bytes32 indexed nullifier);

    function setUp() public {
        mockVerifier = new MockGamingItemTradeVerifier();
        token = new MockERC20();
        gamingItemTrade = new GamingItemTrade(address(mockVerifier), address(token));

        // Fund buyer with tokens
        token.mint(buyer, ITEM_PRICE * 10);
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
    //  listItem
    // ========================

    function test_ListItem() public {
        bytes32 noteHash = keccak256("list-item");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 1, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 1, ITEM_PRICE);
        vm.stopPrank();

        GamingItemTrade.Listing memory listing = gamingItemTrade.getListing(1);
        assertEq(listing.seller, seller);
        assertEq(listing.itemNoteHash, noteHash);
        assertEq(listing.price, ITEM_PRICE);
        assertTrue(listing.active);
    }

    function test_ListItem_EmitsEvent() public {
        bytes32 noteHash = keccak256("list-evt");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 2, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit ItemListed(seller, 1, ITEM_PRICE);

        gamingItemTrade.listItem(noteHash, GAME_ID, 2, ITEM_PRICE);
        vm.stopPrank();
    }

    function test_RevertWhen_ListItem_ZeroPrice() public {
        bytes32 noteHash = keccak256("list-zero");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 3, ENC_NOTE);

        vm.expectRevert("Price must be greater than zero");
        gamingItemTrade.listItem(noteHash, GAME_ID, 3, 0);
        vm.stopPrank();
    }

    function test_RevertWhen_ListItem_NonExistentNote() public {
        vm.expectRevert("Note does not exist or already spent");
        gamingItemTrade.listItem(keccak256("nonexistent"), GAME_ID, 99, ITEM_PRICE);
    }

    // ========================
    //  purchaseItem
    // ========================

    function test_PurchaseItem() public {
        bytes32 noteHash = keccak256("purchase-item");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 4, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 4, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();

        GamingItemTrade.Listing memory listing = gamingItemTrade.getListing(1);
        assertEq(listing.buyer, buyer);
        assertEq(listing.buyerPkX, BUYER_PK_X);
        assertEq(listing.buyerPkY, BUYER_PK_Y);
        assertEq(token.balanceOf(address(gamingItemTrade)), ITEM_PRICE);
    }

    function test_PurchaseItem_EmitsEvent() public {
        bytes32 noteHash = keccak256("purchase-evt");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 5, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 5, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);

        vm.expectEmit(true, true, false, true);
        emit ItemPurchased(buyer, 1, BUYER_PK_X, BUYER_PK_Y);

        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();
    }

    function test_RevertWhen_PurchaseItem_NotActive() public {
        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);

        vm.expectRevert("Listing not active");
        gamingItemTrade.purchaseItem(999, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();
    }

    function test_RevertWhen_PurchaseItem_AlreadyPurchased() public {
        bytes32 noteHash = keccak256("purchase-dup");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 6, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 6, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE * 2);
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);

        vm.expectRevert("Already purchased");
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();
    }

    // ========================
    //  executeTradeForBuyer
    // ========================

    /// @dev Register + list as seller, then purchase as buyer. Returns note hashes and nullifier.
    function _setupReadyToTrade(uint256 itemId)
        internal
        returns (bytes32 oldHash, bytes32 newHash, bytes32 nullifier)
    {
        oldHash   = keccak256(abi.encode("old-trade", itemId));
        newHash   = keccak256(abi.encode("new-trade", itemId));
        nullifier = keccak256(abi.encode("nullifier", itemId));

        vm.startPrank(seller);
        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);
        gamingItemTrade.listItem(oldHash, GAME_ID, itemId, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();
    }

    function test_ExecuteTradeForBuyer() public {
        (bytes32 oldHash, bytes32 newHash, bytes32 nullifier) = _setupReadyToTrade(701);

        uint256 sellerBalanceBefore = token.balanceOf(seller);

        vm.prank(seller);
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );

        assertEq(uint256(gamingItemTrade.getNoteState(oldHash)), 2); // Spent
        assertEq(uint256(gamingItemTrade.getNoteState(newHash)), 1); // Valid
        assertTrue(gamingItemTrade.isNullifierUsed(nullifier));
        assertFalse(gamingItemTrade.getListing(1).active);
        assertEq(token.balanceOf(seller), sellerBalanceBefore + ITEM_PRICE);
    }

    function test_ExecuteTradeForBuyer_EmitsEvents() public {
        (bytes32 oldHash, bytes32 newHash, bytes32 nullifier) = _setupReadyToTrade(702);

        vm.startPrank(seller);

        vm.expectEmit(true, true, false, true);
        emit NoteSpent(oldHash, nullifier);

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(newHash, ENC_NOTE);

        vm.expectEmit(true, false, false, true);
        emit ItemTradeCompleted(1, oldHash, newHash);

        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );
        vm.stopPrank();
    }

    function test_RevertWhen_ExecuteTrade_DoubleSpend() public {
        (, bytes32 newHash, bytes32 nullifier) = _setupReadyToTrade(703);
        bytes32 newHash2 = keccak256("ds-new-2");

        vm.startPrank(seller);
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );

        vm.expectRevert("Nullifier already used");
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash2, bytes32(0), nullifier, ENC_NOTE
        );
        vm.stopPrank();
    }

    function test_RevertWhen_ExecuteTrade_NotSeller() public {
        (, bytes32 newHash, bytes32 nullifier) = _setupReadyToTrade(704);

        vm.prank(buyer);
        vm.expectRevert("Only seller can execute trade");
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );
    }

    function test_RevertWhen_ExecuteTrade_NoBuyer() public {
        bytes32 noteHash  = keccak256("no-buyer-note");
        bytes32 newHash   = keccak256("no-buyer-new");
        bytes32 nullifier = keccak256("no-buyer-null");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 705, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 705, ITEM_PRICE);

        vm.expectRevert("No buyer yet");
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );
        vm.stopPrank();
    }

    // ========================
    //  cancelListing
    // ========================

    function test_CancelListing_NoBuyer() public {
        bytes32 noteHash = keccak256("cancel-no-buyer");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 801, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 801, ITEM_PRICE);

        vm.expectEmit(true, false, false, true);
        emit ListingCancelled(1);

        gamingItemTrade.cancelListing(1);
        vm.stopPrank();

        assertFalse(gamingItemTrade.getListing(1).active);
    }

    function test_CancelListing_WithBuyer_RefundsBuyer() public {
        bytes32 noteHash = keccak256("cancel-with-buyer");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 802, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 802, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();

        uint256 buyerBalanceBefore = token.balanceOf(buyer);

        vm.prank(seller);
        gamingItemTrade.cancelListing(1);

        assertEq(token.balanceOf(buyer), buyerBalanceBefore + ITEM_PRICE);
        assertFalse(gamingItemTrade.getListing(1).active);
    }

    function test_RevertWhen_CancelListing_NotSeller() public {
        bytes32 noteHash = keccak256("cancel-auth");

        vm.startPrank(seller);
        gamingItemTrade.registerItem(noteHash, GAME_ID, 803, ENC_NOTE);
        gamingItemTrade.listItem(noteHash, GAME_ID, 803, ITEM_PRICE);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert("Only seller can cancel");
        gamingItemTrade.cancelListing(1);
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
    //  Fuzz: full trade flow
    // ========================

    function testFuzz_ExecuteTradeForBuyer(
        bytes32 oldHash,
        bytes32 newHash,
        bytes32 nullifier,
        uint256 itemId
    ) public {
        vm.assume(oldHash != newHash);
        vm.assume(oldHash != bytes32(0));
        vm.assume(newHash != bytes32(0));
        vm.assume(nullifier != bytes32(0));

        vm.startPrank(seller);
        gamingItemTrade.registerItem(oldHash, GAME_ID, itemId, ENC_NOTE);
        gamingItemTrade.listItem(oldHash, GAME_ID, itemId, ITEM_PRICE);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(gamingItemTrade), ITEM_PRICE);
        gamingItemTrade.purchaseItem(1, BUYER_PK_X, BUYER_PK_Y);
        vm.stopPrank();

        vm.prank(seller);
        gamingItemTrade.executeTradeForBuyer(
            1, a, b, c, newHash, bytes32(0), nullifier, ENC_NOTE
        );

        assertEq(uint256(gamingItemTrade.getNoteState(oldHash)), 2); // Spent
        assertEq(uint256(gamingItemTrade.getNoteState(newHash)), 1); // Valid
        assertTrue(gamingItemTrade.isNullifierUsed(nullifier));
    }
}
