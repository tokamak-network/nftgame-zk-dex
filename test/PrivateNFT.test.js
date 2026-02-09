const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateNFT", function () {
  let privateNFT;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    // Deploy a mock verifier that always returns true (for unit testing)
    const MockVerifier = await ethers.getContractFactory("MockNFTTransferVerifier");
    const mockVerifier = await MockVerifier.deploy();

    const PrivateNFT = await ethers.getContractFactory("PrivateNFT");
    privateNFT = await PrivateNFT.deploy(await mockVerifier.getAddress());
  });

  describe("registerNFT", function () {
    it("should register a new NFT note", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-note-1"));
      const collection = "0x0000000000000000000000000000000000000001";
      const nftId = 1;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await privateNFT.registerNFT(noteHash, collection, nftId, encryptedNote);

      expect(await privateNFT.getNoteState(noteHash)).to.equal(1); // Valid
      expect(await privateNFT.registeredNFTs(collection, nftId)).to.be.true;
    });

    it("should reject duplicate NFT registration", async function () {
      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-note-1"));
      const collection = "0x0000000000000000000000000000000000000001";
      const nftId = 1;
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await privateNFT.registerNFT(noteHash, collection, nftId, encryptedNote);

      await expect(
        privateNFT.registerNFT(noteHash, collection, nftId, encryptedNote)
      ).to.be.revertedWith("NFT already registered");
    });
  });

  describe("transferNFT", function () {
    it("should transfer NFT with valid proof (mock verifier)", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-note"));
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-note"));
      const collection = "0x0000000000000000000000000000000000000001";
      const nftId = 1;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));
      const encryptedNote = ethers.toUtf8Bytes("new-encrypted-data");

      // Register first
      await privateNFT.registerNFT(
        oldNoteHash,
        collection,
        nftId,
        ethers.toUtf8Bytes("old-encrypted")
      );

      // Mock proof (zeros work since mock verifier always returns true)
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await privateNFT.transferNFT(
        a, b, c,
        oldNoteHash, newNoteHash, nftId, collection, nullifier, encryptedNote
      );

      // Old note should be spent
      expect(await privateNFT.getNoteState(oldNoteHash)).to.equal(2); // Spent
      // New note should be valid
      expect(await privateNFT.getNoteState(newNoteHash)).to.equal(1); // Valid
      // Nullifier should be used
      expect(await privateNFT.isNullifierUsed(nullifier)).to.be.true;
    });

    it("should reject transfer with used nullifier", async function () {
      const oldNoteHash = ethers.keccak256(ethers.toUtf8Bytes("old-note"));
      const newNoteHash1 = ethers.keccak256(ethers.toUtf8Bytes("new-note-1"));
      const newNoteHash2 = ethers.keccak256(ethers.toUtf8Bytes("new-note-2"));
      const collection = "0x0000000000000000000000000000000000000001";
      const nftId = 1;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));

      await privateNFT.registerNFT(
        oldNoteHash,
        collection,
        nftId,
        ethers.toUtf8Bytes("enc")
      );

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await privateNFT.transferNFT(
        a, b, c,
        oldNoteHash, newNoteHash1, nftId, collection, nullifier, ethers.toUtf8Bytes("enc1")
      );

      // Try to use same nullifier again
      await expect(
        privateNFT.transferNFT(
          a, b, c,
          newNoteHash1, newNoteHash2, nftId, collection, nullifier, ethers.toUtf8Bytes("enc2")
        )
      ).to.be.revertedWith("Nullifier already used");
    });
  });
});
