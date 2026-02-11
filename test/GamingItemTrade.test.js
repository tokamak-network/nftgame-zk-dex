const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GamingItemTrade", function () {
  let gamingItemTrade;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory("MockGamingItemTradeVerifier");
    const mockVerifier = await MockVerifier.deploy();

    const GamingItemTrade = await ethers.getContractFactory("GamingItemTrade");
    gamingItemTrade = await GamingItemTrade.deploy(await mockVerifier.getAddress());
  });

  describe("registerItem", function () {
    it("should register a new item note", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-item-1"));
      const gameId = 42;
      const itemId = 101;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await gamingItemTrade.registerItem(noteHash, gameId, itemId, encryptedNote);

      expect(await gamingItemTrade.getNoteState(noteHash)).to.equal(1); // Valid
      expect(await gamingItemTrade.registeredItems(gameId, itemId)).to.be.true;
    });

    it("should reject duplicate item registration", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-item-1"));
      const gameId = 42;
      const itemId = 101;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await gamingItemTrade.registerItem(noteHash, gameId, itemId, encryptedNote);

      await expect(
        gamingItemTrade.registerItem(noteHash, gameId, itemId, encryptedNote)
      ).to.be.revertedWith("Item already registered");
    });

    it("should allow same itemId in different games", async function () {
      const noteHash1 = ethers.keccak256(ethers.toUtf8Bytes("item-game1"));
      const noteHash2 = ethers.keccak256(ethers.toUtf8Bytes("item-game2"));
      const itemId = 101;
      const encryptedNote = ethers.toUtf8Bytes("enc");

      await gamingItemTrade.registerItem(noteHash1, 1, itemId, encryptedNote);
      await gamingItemTrade.registerItem(noteHash2, 2, itemId, encryptedNote);

      expect(await gamingItemTrade.registeredItems(1, itemId)).to.be.true;
      expect(await gamingItemTrade.registeredItems(2, itemId)).to.be.true;
    });

    it("should emit ItemRegistered event", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-item-1"));
      const gameId = 42;
      const itemId = 101;

      await expect(
        gamingItemTrade.registerItem(noteHash, gameId, itemId, ethers.toUtf8Bytes("enc"))
      ).to.emit(gamingItemTrade, "ItemRegistered")
        .withArgs(gameId, itemId, noteHash);
    });
  });

  describe("tradeItem", function () {
    it("should trade item with valid proof (mock verifier)", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-item"));
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-item"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment"));
      const gameId = 42;
      const itemId = 101;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));

      // Register first
      await gamingItemTrade.registerItem(
        oldNoteHash, gameId, itemId, ethers.toUtf8Bytes("old-enc")
      );

      // Mock proof
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await gamingItemTrade.tradeItem(
        a, b, c,
        oldNoteHash, newNoteHash, paymentHash, gameId, nullifier,
        ethers.toUtf8Bytes("new-enc")
      );

      expect(await gamingItemTrade.getNoteState(oldNoteHash)).to.equal(2); // Spent
      expect(await gamingItemTrade.getNoteState(newNoteHash)).to.equal(1); // Valid
      expect(await gamingItemTrade.isNullifierUsed(nullifier)).to.be.true;
    });

    it("should trade item as gift (paymentNoteHash = 0)", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-gift-item"));
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-gift-item"));
      const paymentHash = ethers.zeroPadValue("0x00", 32);
      const gameId = 42;
      const itemId = 202;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-gift"));

      await gamingItemTrade.registerItem(
        oldNoteHash, gameId, itemId, ethers.toUtf8Bytes("enc")
      );

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await gamingItemTrade.tradeItem(
        a, b, c,
        oldNoteHash, newNoteHash, paymentHash, gameId, nullifier,
        ethers.toUtf8Bytes("new-enc")
      );

      expect(await gamingItemTrade.getNoteState(oldNoteHash)).to.equal(2);
      expect(await gamingItemTrade.getNoteState(newNoteHash)).to.equal(1);
    });

    it("should reject transfer with used nullifier", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-item"));
      const newNoteHash1 = ethers.keccak256(ethers.toUtf8Bytes("new-item-1"));
      const newNoteHash2 = ethers.keccak256(ethers.toUtf8Bytes("new-item-2"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment"));
      const gameId = 42;
      const itemId = 101;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-dup"));

      await gamingItemTrade.registerItem(
        oldNoteHash, gameId, itemId, ethers.toUtf8Bytes("enc")
      );

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await gamingItemTrade.tradeItem(
        a, b, c,
        oldNoteHash, newNoteHash1, paymentHash, gameId, nullifier,
        ethers.toUtf8Bytes("enc1")
      );

      await expect(
        gamingItemTrade.tradeItem(
          a, b, c,
          newNoteHash1, newNoteHash2, paymentHash, gameId, nullifier,
          ethers.toUtf8Bytes("enc2")
        )
      ).to.be.revertedWith("Nullifier already used");
    });

    it("should reject trade of non-existent note", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("pay"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        gamingItemTrade.tradeItem(
          a, b, c,
          fakeHash, newHash, paymentHash, 42, nullifier,
          ethers.toUtf8Bytes("enc")
        )
      ).to.be.revertedWith("Note does not exist or already spent");
    });

    it("should emit ItemTraded event", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-item-evt"));
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-item-evt"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("pay-evt"));
      const gameId = 42;
      const itemId = 301;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-evt"));

      await gamingItemTrade.registerItem(
        oldNoteHash, gameId, itemId, ethers.toUtf8Bytes("enc")
      );

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        gamingItemTrade.tradeItem(
          a, b, c,
          oldNoteHash, newNoteHash, paymentHash, gameId, nullifier,
          ethers.toUtf8Bytes("enc")
        )
      ).to.emit(gamingItemTrade, "ItemTraded")
        .withArgs(oldNoteHash, newNoteHash, nullifier);
    });
  });
});
