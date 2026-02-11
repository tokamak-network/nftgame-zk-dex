const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LootBoxOpen", function () {
  let lootBoxOpen;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory("MockLootBoxVerifier");
    const mockVerifier = await MockVerifier.deploy();

    const LootBoxOpen = await ethers.getContractFactory("LootBoxOpen");
    lootBoxOpen = await LootBoxOpen.deploy(await mockVerifier.getAddress());
  });

  describe("registerBox", function () {
    it("should register a new box note", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-1"));
      const boxId = 1;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await lootBoxOpen.registerBox(noteHash, boxId, encryptedNote);

      expect(await lootBoxOpen.getNoteState(noteHash)).to.equal(1); // Valid
      expect(await lootBoxOpen.registeredBoxes(boxId)).to.be.true;
    });

    it("should reject duplicate box registration", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-1"));
      const boxId = 1;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await lootBoxOpen.registerBox(noteHash, boxId, encryptedNote);

      await expect(
        lootBoxOpen.registerBox(
          ethers.keccak256(ethers.toUtf8Bytes("diff-hash")), boxId, encryptedNote
        )
      ).to.be.revertedWith("Box already registered");
    });

    it("should reject duplicate note hash", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("same-hash"));

      await lootBoxOpen.registerBox(noteHash, 1, ethers.toUtf8Bytes("enc"));

      await expect(
        lootBoxOpen.registerBox(noteHash, 2, ethers.toUtf8Bytes("enc"))
      ).to.be.revertedWith("Note already exists");
    });

    it("should emit BoxRegistered event", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-evt"));
      const boxId = 42;

      await expect(
        lootBoxOpen.registerBox(noteHash, boxId, ethers.toUtf8Bytes("enc"))
      ).to.emit(lootBoxOpen, "BoxRegistered")
        .withArgs(boxId, noteHash);
    });
  });

  describe("openBox", function () {
    it("should open box with valid proof (mock verifier)", async function () {
      const boxHash = ethers.keccak256(ethers.toUtf8Bytes("sealed-box"));
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome-item"));
      const vrfOutput = 42;
      const boxId = 1;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));

      // Register first
      await lootBoxOpen.registerBox(boxHash, boxId, ethers.toUtf8Bytes("old-enc"));

      // Mock proof
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await lootBoxOpen.openBox(
        a, b, c,
        boxHash, outcomeHash, vrfOutput, boxId, nullifier,
        ethers.toUtf8Bytes("new-enc")
      );

      expect(await lootBoxOpen.getNoteState(boxHash)).to.equal(2); // Spent
      expect(await lootBoxOpen.getNoteState(outcomeHash)).to.equal(1); // Valid
      expect(await lootBoxOpen.isNullifierUsed(nullifier)).to.be.true;
    });

    it("should reject double-open (same nullifier)", async function () {
      const boxHash = ethers.keccak256(ethers.toUtf8Bytes("box-ds"));
      const outcomeHash1 = ethers.keccak256(ethers.toUtf8Bytes("outcome-1"));
      const outcomeHash2 = ethers.keccak256(ethers.toUtf8Bytes("outcome-2"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-ds"));
      const boxId = 1;

      await lootBoxOpen.registerBox(boxHash, boxId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await lootBoxOpen.openBox(
        a, b, c,
        boxHash, outcomeHash1, 42, boxId, nullifier,
        ethers.toUtf8Bytes("enc1")
      );

      await expect(
        lootBoxOpen.openBox(
          a, b, c,
          outcomeHash1, outcomeHash2, 42, boxId, nullifier,
          ethers.toUtf8Bytes("enc2")
        )
      ).to.be.revertedWith("Nullifier already used");
    });

    it("should reject opening already-spent box", async function () {
      const boxHash = ethers.keccak256(ethers.toUtf8Bytes("box-spent"));
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome-spent"));
      const null1 = ethers.keccak256(ethers.toUtf8Bytes("null-spent-1"));
      const null2 = ethers.keccak256(ethers.toUtf8Bytes("null-spent-2"));
      const boxId = 1;

      await lootBoxOpen.registerBox(boxHash, boxId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await lootBoxOpen.openBox(
        a, b, c,
        boxHash, outcomeHash, 42, boxId, null1,
        ethers.toUtf8Bytes("enc")
      );

      await expect(
        lootBoxOpen.openBox(
          a, b, c,
          boxHash, ethers.keccak256(ethers.toUtf8Bytes("x")), 42, boxId, null2,
          ethers.toUtf8Bytes("enc")
        )
      ).to.be.revertedWith("Note does not exist or already spent");
    });

    it("should reject opening non-existent box", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        lootBoxOpen.openBox(
          a, b, c,
          fakeHash, outcomeHash, 42, 1, nullifier,
          ethers.toUtf8Bytes("enc")
        )
      ).to.be.revertedWith("Note does not exist or already spent");
    });

    it("should emit BoxOpened event", async function () {
      const boxHash = ethers.keccak256(ethers.toUtf8Bytes("box-evt"));
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome-evt"));
      const vrfOutput = 42;
      const boxId = 1;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-evt"));

      await lootBoxOpen.registerBox(boxHash, boxId, ethers.toUtf8Bytes("enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await expect(
        lootBoxOpen.openBox(
          a, b, c,
          boxHash, outcomeHash, vrfOutput, boxId, nullifier,
          ethers.toUtf8Bytes("enc")
        )
      ).to.emit(lootBoxOpen, "BoxOpened")
        .withArgs(boxHash, outcomeHash, nullifier, vrfOutput);
    });
  });
});
