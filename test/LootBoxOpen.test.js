const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LootBoxOpen", function () {
  let lootBoxOpen;
  let mockToken;
  let owner;
  let user1;
  let user2;

  const BOX_PRICE = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy();

    // Mint tokens to users
    await mockToken.mint(owner.address, ethers.parseEther("10000"));
    await mockToken.mint(user1.address, ethers.parseEther("10000"));
    await mockToken.mint(user2.address, ethers.parseEther("10000"));

    // Deploy mock verifier
    const MockVerifier = await ethers.getContractFactory("MockLootBoxVerifier");
    const mockVerifier = await MockVerifier.deploy();

    // Deploy LootBoxOpen with 3 params
    const LootBoxOpen = await ethers.getContractFactory("LootBoxOpen");
    lootBoxOpen = await LootBoxOpen.deploy(
      await mockVerifier.getAddress(),
      await mockToken.getAddress(),
      BOX_PRICE,
    );
  });

  describe("mintBox", function () {
    it("should mint a box after ERC20 payment", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      expect(await lootBoxOpen.boxOwner(1)).to.equal(owner.address);
      expect(await lootBoxOpen.boxTypes(1)).to.equal(0);
      expect(await lootBoxOpen.nextBoxId()).to.equal(2);
    });

    it("should deduct tokens on mint", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      const balBefore = await mockToken.balanceOf(owner.address);

      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const balAfter = await mockToken.balanceOf(owner.address);
      expect(balBefore - balAfter).to.equal(BOX_PRICE);
    });

    it("should fail without approval", async function () {
      await expect(lootBoxOpen.mintBox(0)).to.be.reverted;
    });

    it("should emit BoxMinted event", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);

      await expect(lootBoxOpen.mintBox(1))
        .to.emit(lootBoxOpen, "BoxMinted")
        .withArgs(owner.address, 1, 1);
    });

    it("should auto-increment box IDs", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE * 3n);

      await lootBoxOpen.mintBox(0);
      await lootBoxOpen.mintBox(1);
      await lootBoxOpen.mintBox(2);

      expect(await lootBoxOpen.boxOwner(1)).to.equal(owner.address);
      expect(await lootBoxOpen.boxOwner(2)).to.equal(owner.address);
      expect(await lootBoxOpen.boxOwner(3)).to.equal(owner.address);
      expect(await lootBoxOpen.nextBoxId()).to.equal(4);
    });
  });

  describe("registerBox", function () {
    it("should register a box owned by caller", async function () {
      // Mint a box first
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-1"));
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await lootBoxOpen.registerBox(noteHash, 1, encryptedNote);

      expect(await lootBoxOpen.getNoteState(noteHash)).to.equal(1);
      expect(await lootBoxOpen.registeredBoxes(1)).to.be.true;
    });

    it("should reject registration by non-owner", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-1"));
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await expect(
        lootBoxOpen.connect(user1).registerBox(noteHash, 1, encryptedNote)
      ).to.be.revertedWith("Not box owner");
    });

    it("should reject duplicate box registration", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-1"));
      const encryptedNote = ethers.toUtf8Bytes("encrypted-data");

      await lootBoxOpen.registerBox(noteHash, 1, encryptedNote);

      await expect(
        lootBoxOpen.registerBox(
          ethers.keccak256(ethers.toUtf8Bytes("diff-hash")), 1, encryptedNote
        )
      ).to.be.revertedWith("Box already registered");
    });

    it("should reject duplicate note hash", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE * 2n);
      await lootBoxOpen.mintBox(0);
      await lootBoxOpen.mintBox(0);

      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("same-hash"));

      await lootBoxOpen.registerBox(noteHash, 1, ethers.toUtf8Bytes("enc"));

      await expect(
        lootBoxOpen.registerBox(noteHash, 2, ethers.toUtf8Bytes("enc"))
      ).to.be.revertedWith("Note already exists");
    });

    it("should emit BoxRegistered event", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const noteHash = ethers.keccak256(ethers.toUtf8Bytes("test-box-evt"));
      const boxId = 1;

      await expect(
        lootBoxOpen.registerBox(noteHash, boxId, ethers.toUtf8Bytes("enc"))
      ).to.emit(lootBoxOpen, "BoxRegistered")
        .withArgs(boxId, noteHash);
    });
  });

  describe("openBox", function () {
    it("should open box with valid proof (mock verifier)", async function () {
      // Mint + register
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const boxHash = ethers.keccak256(ethers.toUtf8Bytes("sealed-box"));
      const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome-item"));
      const vrfOutput = 42;
      const boxId = 1;
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));

      await lootBoxOpen.registerBox(boxHash, boxId, ethers.toUtf8Bytes("old-enc"));

      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];

      await lootBoxOpen.openBox(
        a, b, c,
        boxHash, outcomeHash, vrfOutput, boxId, nullifier,
        ethers.toUtf8Bytes("new-enc")
      );

      expect(await lootBoxOpen.getNoteState(boxHash)).to.equal(2);
      expect(await lootBoxOpen.getNoteState(outcomeHash)).to.equal(1);
      expect(await lootBoxOpen.isNullifierUsed(nullifier)).to.be.true;
    });

    it("should reject double-open (same nullifier)", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

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
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

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

  describe("getMyBoxes", function () {
    it("should return all boxes owned by user", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE * 3n);

      await lootBoxOpen.mintBox(0);
      await lootBoxOpen.mintBox(1);
      await lootBoxOpen.mintBox(2);

      const boxes = await lootBoxOpen.getMyBoxes(owner.address);
      expect(boxes.length).to.equal(3);
      expect(boxes[0]).to.equal(1);
      expect(boxes[1]).to.equal(2);
      expect(boxes[2]).to.equal(3);
    });

    it("should return empty array for user with no boxes", async function () {
      const boxes = await lootBoxOpen.getMyBoxes(user1.address);
      expect(boxes.length).to.equal(0);
    });
  });

  describe("getBoxInfo", function () {
    it("should return correct box info", async function () {
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(2);

      const [infoOwner, boxType, registered] = await lootBoxOpen.getBoxInfo(1);
      expect(infoOwner).to.equal(owner.address);
      expect(boxType).to.equal(2);
      expect(registered).to.be.false;
    });
  });

  describe("admin functions", function () {
    it("should allow admin to set box price", async function () {
      const newPrice = ethers.parseEther("20");
      await lootBoxOpen.setBoxPrice(newPrice);
      expect(await lootBoxOpen.boxPrice()).to.equal(newPrice);
    });

    it("should reject non-admin setting price", async function () {
      await expect(
        lootBoxOpen.connect(user1).setBoxPrice(ethers.parseEther("20"))
      ).to.be.revertedWith("Only admin");
    });

    it("should emit PriceUpdated event", async function () {
      const newPrice = ethers.parseEther("25");
      await expect(lootBoxOpen.setBoxPrice(newPrice))
        .to.emit(lootBoxOpen, "PriceUpdated")
        .withArgs(newPrice);
    });

    it("should allow admin to withdraw tokens", async function () {
      // Mint a box to accumulate tokens
      const lootBoxAddr = await lootBoxOpen.getAddress();
      await mockToken.approve(lootBoxAddr, BOX_PRICE);
      await lootBoxOpen.mintBox(0);

      const balBefore = await mockToken.balanceOf(user2.address);
      await lootBoxOpen.withdrawTokens(user2.address);
      const balAfter = await mockToken.balanceOf(user2.address);

      expect(balAfter - balBefore).to.equal(BOX_PRICE);
    });

    it("should reject non-admin withdrawal", async function () {
      await expect(
        lootBoxOpen.connect(user1).withdrawTokens(user1.address)
      ).to.be.revertedWith("Only admin");
    });

    it("should reject withdrawal when no tokens", async function () {
      await expect(
        lootBoxOpen.withdrawTokens(owner.address)
      ).to.be.revertedWith("No tokens to withdraw");
    });
  });
});
