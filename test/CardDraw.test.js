const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CardDraw", function () {
  let cardDraw;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory("MockCardDrawVerifier");
    const mockVerifier = await MockVerifier.deploy();

    const CardDraw = await ethers.getContractFactory("CardDraw");
    cardDraw = await CardDraw.deploy(await mockVerifier.getAddress());
  });

  describe("registerDeck", function () {
    it("should register a new deck", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-1"));
      const gameId = 1;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-deck");

      await cardDraw.registerDeck(deckCommitment, gameId, encryptedNote);

      expect(await cardDraw.getNoteState(deckCommitment)).to.equal(1); // Valid
      expect(await cardDraw.registeredDecks(gameId)).to.equal(deckCommitment);
    });

    it("should reject duplicate game registration", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-1"));
      const gameId = 1;

      await cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"));

      await expect(
        cardDraw.registerDeck(
          ethers.keccak256(ethers.toUtf8Bytes("deck-2")), gameId, ethers.toUtf8Bytes("enc")
        )
      ).to.be.revertedWith("Deck already registered for this game");
    });

    it("should reject duplicate note hash", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("same-hash"));

      await cardDraw.registerDeck(deckCommitment, 1, ethers.toUtf8Bytes("enc"));

      await expect(
        cardDraw.registerDeck(deckCommitment, 2, ethers.toUtf8Bytes("enc"))
      ).to.be.revertedWith("Note already exists");
    });

    it("should emit DeckRegistered event", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-evt"));
      const gameId = 42;

      await expect(
        cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"))
      ).to.emit(cardDraw, "DeckRegistered")
        .withArgs(gameId, deckCommitment);
    });
  });

  describe("drawCard", function () {
    it("should draw card with valid proof (mock verifier)", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw-card"));
      const drawIndex = 0;
      const gameId = 1;
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      await cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await cardDraw.drawCard(
        a, b, c,
        deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment,
        ethers.toUtf8Bytes("card-enc")
      );

      // Deck should remain Valid (not consumed)
      expect(await cardDraw.getNoteState(deckCommitment)).to.equal(1);
      // Draw commitment note should be created
      expect(await cardDraw.getNoteState(drawCommitment)).to.equal(1);
      // DrawIndex should be marked
      expect(await cardDraw.drawnCards(gameId, drawIndex)).to.be.true;
    });

    it("should reject duplicate drawIndex (same game)", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-dup"));
      const drawCommitment1 = ethers.keccak256(ethers.toUtf8Bytes("draw-1"));
      const drawCommitment2 = ethers.keccak256(ethers.toUtf8Bytes("draw-2"));
      const gameId = 1;
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      await cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await cardDraw.drawCard(
        a, b, c,
        deckCommitment, drawCommitment1, 0, gameId, playerCommitment,
        ethers.toUtf8Bytes("enc1")
      );

      await expect(
        cardDraw.drawCard(
          a, b, c,
          deckCommitment, drawCommitment2, 0, gameId, playerCommitment,
          ethers.toUtf8Bytes("enc2")
        )
      ).to.be.revertedWith("Card already drawn at this index");
    });

    it("should allow multiple draws at different indices", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-multi"));
      const gameId = 1;
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      await cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      // Draw index 0
      const draw0 = ethers.keccak256(ethers.toUtf8Bytes("draw-0"));
      await cardDraw.drawCard(
        a, b, c,
        deckCommitment, draw0, 0, gameId, playerCommitment,
        ethers.toUtf8Bytes("enc0")
      );

      // Draw index 1
      const draw1 = ethers.keccak256(ethers.toUtf8Bytes("draw-1"));
      await cardDraw.drawCard(
        a, b, c,
        deckCommitment, draw1, 1, gameId, playerCommitment,
        ethers.toUtf8Bytes("enc1")
      );

      // Draw index 2
      const draw2 = ethers.keccak256(ethers.toUtf8Bytes("draw-2"));
      await cardDraw.drawCard(
        a, b, c,
        deckCommitment, draw2, 2, gameId, playerCommitment,
        ethers.toUtf8Bytes("enc2")
      );

      // Deck still valid
      expect(await cardDraw.getNoteState(deckCommitment)).to.equal(1);
      // All draws registered
      expect(await cardDraw.drawnCards(gameId, 0)).to.be.true;
      expect(await cardDraw.drawnCards(gameId, 1)).to.be.true;
      expect(await cardDraw.drawnCards(gameId, 2)).to.be.true;
    });

    it("should reject draw for unregistered game", async function () {
      const fakeDeck = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        cardDraw.drawCard(
          a, b, c,
          fakeDeck, drawCommitment, 0, 999, playerCommitment,
          ethers.toUtf8Bytes("enc")
        )
      ).to.be.revertedWith("Deck not registered for this game");
    });

    it("should emit CardDrawn event", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-evt"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw-evt"));
      const drawIndex = 5;
      const gameId = 1;
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player-evt"));

      await cardDraw.registerDeck(deckCommitment, gameId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        cardDraw.drawCard(
          a, b, c,
          deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment,
          ethers.toUtf8Bytes("enc")
        )
      ).to.emit(cardDraw, "CardDrawn")
        .withArgs(deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment);
    });
  });
});
