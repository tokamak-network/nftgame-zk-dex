// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/CardDraw.sol";
import "../../contracts/test/MockCardDrawVerifier.sol";

contract CardDrawTest is Test {
    CardDraw public cardDraw;
    MockCardDrawVerifier public mockVerifier;

    bytes public constant ENC_NOTE = "encrypted-data";

    // Groth16 dummy proof (mock always returns true)
    uint256[2] internal a = [uint256(0), uint256(0)];
    uint256[2][2] internal b = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
    uint256[2] internal c = [uint256(0), uint256(0)];

    event DeckRegistered(uint256 indexed gameId, bytes32 deckCommitment);
    event CardDrawn(
        bytes32 indexed deckCommitment,
        bytes32 indexed drawCommitment,
        uint256 drawIndex,
        uint256 gameId,
        bytes32 playerCommitment
    );
    event NoteCreated(bytes32 indexed noteHash, bytes encryptedNote);

    function setUp() public {
        mockVerifier = new MockCardDrawVerifier();
        cardDraw = new CardDraw(address(mockVerifier));
    }

    // ========================
    //  registerDeck
    // ========================

    function test_RegisterDeck() public {
        bytes32 deckCommitment = keccak256("deck-1");
        uint256 gameId = 1;

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        assertEq(uint256(cardDraw.getNoteState(deckCommitment)), 1); // Valid
        assertEq(cardDraw.registeredDecks(gameId), deckCommitment);
    }

    function test_RegisterDeck_EmitsEvent() public {
        bytes32 deckCommitment = keccak256("deck-evt");
        uint256 gameId = 42;

        vm.expectEmit(true, false, false, true);
        emit DeckRegistered(gameId, deckCommitment);

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);
    }

    function test_RegisterDeck_EmitsNoteCreated() public {
        bytes32 deckCommitment = keccak256("deck-note-created");
        uint256 gameId = 43;

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(deckCommitment, ENC_NOTE);

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateGameRegistration() public {
        bytes32 deckCommitment = keccak256("deck-dup");
        uint256 gameId = 1;

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        vm.expectRevert("Deck already registered for this game");
        cardDraw.registerDeck(keccak256("deck-dup-2"), gameId, ENC_NOTE);
    }

    function test_RevertWhen_DuplicateNoteHash() public {
        bytes32 deckCommitment = keccak256("same-deck-hash");

        cardDraw.registerDeck(deckCommitment, 1, ENC_NOTE);

        vm.expectRevert("Note already exists");
        cardDraw.registerDeck(deckCommitment, 2, ENC_NOTE);
    }

    function testFuzz_RegisterDeck(bytes32 deckCommitment, uint256 gameId) public {
        vm.assume(deckCommitment != bytes32(0));

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        assertEq(uint256(cardDraw.getNoteState(deckCommitment)), 1);
        assertEq(cardDraw.registeredDecks(gameId), deckCommitment);
    }

    // ========================
    //  drawCard
    // ========================

    function test_DrawCard() public {
        bytes32 deckCommitment = keccak256("deck-draw");
        bytes32 drawCommitment = keccak256("draw-1");
        uint256 drawIndex = 0;
        uint256 gameId = 1;
        bytes32 playerCommitment = keccak256("player-1");

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        cardDraw.drawCard(
            a, b, c,
            deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, ENC_NOTE
        );

        // Deck remains Valid (persistent)
        assertEq(uint256(cardDraw.getNoteState(deckCommitment)), 1);
        // Draw commitment created
        assertEq(uint256(cardDraw.getNoteState(drawCommitment)), 1);
        // Draw index marked
        assertTrue(cardDraw.drawnCards(gameId, drawIndex));
    }

    function test_DrawCard_EmitsEvents() public {
        bytes32 deckCommitment = keccak256("deck-draw-evt");
        bytes32 drawCommitment = keccak256("draw-evt");
        uint256 drawIndex = 5;
        uint256 gameId = 1;
        bytes32 playerCommitment = keccak256("player-evt");

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        vm.expectEmit(true, false, false, true);
        emit NoteCreated(drawCommitment, ENC_NOTE);

        vm.expectEmit(true, true, false, true);
        emit CardDrawn(deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment);

        cardDraw.drawCard(
            a, b, c,
            deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, ENC_NOTE
        );
    }

    function test_DrawMultipleCards() public {
        bytes32 deckCommitment = keccak256("deck-multi");
        uint256 gameId = 1;
        bytes32 playerCommitment = keccak256("player-multi");

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        // Draw 3 cards at different indices
        bytes32 draw0 = keccak256("draw-multi-0");
        bytes32 draw1 = keccak256("draw-multi-1");
        bytes32 draw2 = keccak256("draw-multi-2");

        cardDraw.drawCard(a, b, c, deckCommitment, draw0, 0, gameId, playerCommitment, ENC_NOTE);
        cardDraw.drawCard(a, b, c, deckCommitment, draw1, 1, gameId, playerCommitment, ENC_NOTE);
        cardDraw.drawCard(a, b, c, deckCommitment, draw2, 2, gameId, playerCommitment, ENC_NOTE);

        // Deck still valid
        assertEq(uint256(cardDraw.getNoteState(deckCommitment)), 1);
        // All draws registered
        assertTrue(cardDraw.drawnCards(gameId, 0));
        assertTrue(cardDraw.drawnCards(gameId, 1));
        assertTrue(cardDraw.drawnCards(gameId, 2));
        // All draw notes created
        assertEq(uint256(cardDraw.getNoteState(draw0)), 1);
        assertEq(uint256(cardDraw.getNoteState(draw1)), 1);
        assertEq(uint256(cardDraw.getNoteState(draw2)), 1);
    }

    // ========================
    //  Rejection cases
    // ========================

    function test_RevertWhen_DuplicateDrawIndex() public {
        bytes32 deckCommitment = keccak256("deck-dup-draw");
        bytes32 draw1 = keccak256("draw-dup-1");
        bytes32 draw2 = keccak256("draw-dup-2");
        uint256 gameId = 1;
        bytes32 playerCommitment = keccak256("player");

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);
        cardDraw.drawCard(a, b, c, deckCommitment, draw1, 0, gameId, playerCommitment, ENC_NOTE);

        vm.expectRevert("Card already drawn at this index");
        cardDraw.drawCard(a, b, c, deckCommitment, draw2, 0, gameId, playerCommitment, ENC_NOTE);
    }

    function test_RevertWhen_UnregisteredGame() public {
        bytes32 fakeDeck = keccak256("fake-deck");
        bytes32 drawCommitment = keccak256("draw-fake");
        bytes32 playerCommitment = keccak256("player");

        vm.expectRevert("Deck not registered for this game");
        cardDraw.drawCard(a, b, c, fakeDeck, drawCommitment, 0, 999, playerCommitment, ENC_NOTE);
    }

    function test_RevertWhen_WrongDeckCommitment() public {
        bytes32 deckCommitment = keccak256("real-deck");
        bytes32 wrongDeck = keccak256("wrong-deck");
        uint256 gameId = 1;
        bytes32 playerCommitment = keccak256("player");

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        vm.expectRevert("Deck not registered for this game");
        cardDraw.drawCard(a, b, c, wrongDeck, keccak256("draw"), 0, gameId, playerCommitment, ENC_NOTE);
    }

    // ========================
    //  View functions
    // ========================

    function test_GetNoteState_Invalid() public view {
        assertEq(uint256(cardDraw.getNoteState(keccak256("random"))), 0);
    }

    function test_DrawnCards_False() public view {
        assertFalse(cardDraw.drawnCards(1, 0));
    }

    // ========================
    //  Fuzz: draw flow
    // ========================

    function testFuzz_DrawCard(
        bytes32 deckCommitment,
        bytes32 drawCommitment,
        uint256 drawIndex,
        uint256 gameId,
        bytes32 playerCommitment
    ) public {
        vm.assume(deckCommitment != bytes32(0));
        vm.assume(drawCommitment != bytes32(0));
        vm.assume(deckCommitment != drawCommitment);

        cardDraw.registerDeck(deckCommitment, gameId, ENC_NOTE);

        cardDraw.drawCard(
            a, b, c,
            deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment, ENC_NOTE
        );

        assertEq(uint256(cardDraw.getNoteState(deckCommitment)), 1); // Still valid
        assertEq(uint256(cardDraw.getNoteState(drawCommitment)), 1);
        assertTrue(cardDraw.drawnCards(gameId, drawIndex));
    }
}
