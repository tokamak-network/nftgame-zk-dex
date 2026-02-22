const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GamingItemTrade", function () {
  let gamingItemTrade;
  let mockToken;
  let owner, seller, buyer;

  const ITEM_NOTE_HASH = ethers.keccak256(ethers.toUtf8Bytes("item-note-1"));
  const ENC = ethers.toUtf8Bytes("encrypted-data");
  const GAME_ID = 42n;
  const ITEM_ID = 101n;
  const PRICE = ethers.parseEther("10");
  const BUYER_PKX = 12345n;
  const BUYER_PKY = 67890n;

  const MOCK_PROOF = {
    a: [0n, 0n],
    b: [[0n, 0n], [0n, 0n]],
    c: [0n, 0n],
  };

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy();

    await mockToken.mint(seller.address, ethers.parseEther("10000"));
    await mockToken.mint(buyer.address, ethers.parseEther("10000"));

    const MockVerifier = await ethers.getContractFactory("MockGamingItemTradeVerifier");
    const mockVerifier = await MockVerifier.deploy();

    const GamingItemTrade = await ethers.getContractFactory("GamingItemTrade");
    gamingItemTrade = await GamingItemTrade.deploy(
      await mockVerifier.getAddress(),
      await mockToken.getAddress()
    );
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function registerAndList(overrides = {}) {
    const noteHash = overrides.noteHash ?? ITEM_NOTE_HASH;
    const gameId = overrides.gameId ?? GAME_ID;
    const itemId = overrides.itemId ?? ITEM_ID;
    const price = overrides.price ?? PRICE;

    await gamingItemTrade.connect(seller).registerItem(noteHash, gameId, itemId, ENC);
    await gamingItemTrade.connect(seller).listItem(noteHash, gameId, itemId, price);
    const listingId = (await gamingItemTrade.nextListingId()) - 1n;
    return { noteHash, gameId, itemId, price, listingId };
  }

  async function purchase(listingId, overrides = {}) {
    const pkX = overrides.pkX ?? BUYER_PKX;
    const pkY = overrides.pkY ?? BUYER_PKY;
    const price = overrides.price ?? PRICE;
    await mockToken.connect(buyer).approve(await gamingItemTrade.getAddress(), price);
    await gamingItemTrade.connect(buyer).purchaseItem(listingId, pkX, pkY);
  }

  async function executeTrade(listingId, overrides = {}) {
    const newNoteHash = overrides.newNoteHash ?? ethers.keccak256(ethers.toUtf8Bytes("new-item-note"));
    const paymentHash = overrides.paymentHash ?? ethers.keccak256(ethers.toUtf8Bytes("payment"));
    const nullifier = overrides.nullifier ?? ethers.keccak256(ethers.toUtf8Bytes("nullifier-1"));

    await gamingItemTrade.connect(seller).executeTradeForBuyer(
      listingId,
      MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
      newNoteHash, paymentHash, nullifier, ENC
    );
    return { newNoteHash, nullifier };
  }

  // ─── registerItem ───────────────────────────────────────────────────────────

  describe("registerItem", function () {
    it("should register a new item note", async function () {
      await gamingItemTrade.connect(seller).registerItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, ENC);

      expect(await gamingItemTrade.getNoteState(ITEM_NOTE_HASH)).to.equal(1); // Valid
      expect(await gamingItemTrade.registeredItems(GAME_ID, ITEM_ID)).to.be.true;
    });

    it("should reject duplicate item registration", async function () {
      await gamingItemTrade.connect(seller).registerItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, ENC);
      await expect(
        gamingItemTrade.connect(seller).registerItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, ENC)
      ).to.be.revertedWith("Item already registered");
    });

    it("should allow same itemId in different games", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("item-game1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("item-game2"));
      await gamingItemTrade.connect(seller).registerItem(hash1, 1n, ITEM_ID, ENC);
      await gamingItemTrade.connect(seller).registerItem(hash2, 2n, ITEM_ID, ENC);
      expect(await gamingItemTrade.registeredItems(1n, ITEM_ID)).to.be.true;
      expect(await gamingItemTrade.registeredItems(2n, ITEM_ID)).to.be.true;
    });

    it("should emit ItemRegistered event", async function () {
      await expect(
        gamingItemTrade.connect(seller).registerItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, ENC)
      ).to.emit(gamingItemTrade, "ItemRegistered")
        .withArgs(GAME_ID, ITEM_ID, ITEM_NOTE_HASH);
    });
  });

  // ─── listItem ───────────────────────────────────────────────────────────────

  describe("listItem", function () {
    beforeEach(async function () {
      await gamingItemTrade.connect(seller).registerItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, ENC);
    });

    it("should create a listing successfully", async function () {
      await gamingItemTrade.connect(seller).listItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, PRICE);
      const listing = await gamingItemTrade.getListing(1n);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.itemNoteHash).to.equal(ITEM_NOTE_HASH);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.be.true;
    });

    it("should emit ItemListed event", async function () {
      await expect(
        gamingItemTrade.connect(seller).listItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, PRICE)
      ).to.emit(gamingItemTrade, "ItemListed")
        .withArgs(seller.address, 1n, PRICE);
    });

    it("should reject price=0", async function () {
      await expect(
        gamingItemTrade.connect(seller).listItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, 0n)
      ).to.be.revertedWith("Price must be greater than zero");
    });

    it("should reject non-existent note", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      await expect(
        gamingItemTrade.connect(seller).listItem(fakeHash, GAME_ID, ITEM_ID, PRICE)
      ).to.be.revertedWith("Note does not exist or already spent");
    });

    it("should increment listingId", async function () {
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("item-note-2"));
      await gamingItemTrade.connect(seller).registerItem(hash2, GAME_ID, 102n, ENC);
      await gamingItemTrade.connect(seller).listItem(ITEM_NOTE_HASH, GAME_ID, ITEM_ID, PRICE);
      await gamingItemTrade.connect(seller).listItem(hash2, GAME_ID, 102n, PRICE);
      expect(await gamingItemTrade.nextListingId()).to.equal(3n);
    });
  });

  // ─── purchaseItem ───────────────────────────────────────────────────────────

  describe("purchaseItem", function () {
    let listingId;

    beforeEach(async function () {
      ({ listingId } = await registerAndList());
    });

    it("should accept buyer payment and set buyer info", async function () {
      await purchase(listingId);
      const listing = await gamingItemTrade.getListing(listingId);
      expect(listing.buyer).to.equal(buyer.address);
      expect(listing.buyerPkX).to.equal(BUYER_PKX);
      expect(listing.buyerPkY).to.equal(BUYER_PKY);
    });

    it("should hold tokens in escrow", async function () {
      const contractAddr = await gamingItemTrade.getAddress();
      const before = await mockToken.balanceOf(contractAddr);
      await purchase(listingId);
      const after = await mockToken.balanceOf(contractAddr);
      expect(after - before).to.equal(PRICE);
    });

    it("should emit ItemPurchased event", async function () {
      await mockToken.connect(buyer).approve(await gamingItemTrade.getAddress(), PRICE);
      await expect(
        gamingItemTrade.connect(buyer).purchaseItem(listingId, BUYER_PKX, BUYER_PKY)
      ).to.emit(gamingItemTrade, "ItemPurchased")
        .withArgs(buyer.address, listingId, BUYER_PKX, BUYER_PKY);
    });

    it("should reject duplicate purchase", async function () {
      await purchase(listingId);
      await mockToken.connect(buyer).approve(await gamingItemTrade.getAddress(), PRICE);
      await expect(
        gamingItemTrade.connect(buyer).purchaseItem(listingId, BUYER_PKX, BUYER_PKY)
      ).to.be.revertedWith("Already purchased");
    });

    it("should reject without approval", async function () {
      // No approve call — transferFrom should fail
      await expect(
        gamingItemTrade.connect(buyer).purchaseItem(listingId, BUYER_PKX, BUYER_PKY)
      ).to.be.reverted;
    });

    it("should reject zero pubkey", async function () {
      await mockToken.connect(buyer).approve(await gamingItemTrade.getAddress(), PRICE);
      await expect(
        gamingItemTrade.connect(buyer).purchaseItem(listingId, 0n, 0n)
      ).to.be.revertedWith("Invalid buyer pubkey");
    });
  });

  // ─── executeTradeForBuyer ───────────────────────────────────────────────────

  describe("executeTradeForBuyer", function () {
    let listingId;

    beforeEach(async function () {
      ({ listingId } = await registerAndList());
      await purchase(listingId);
    });

    it("should complete trade and create new note", async function () {
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-note"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-1"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment-1"));

      await gamingItemTrade.connect(seller).executeTradeForBuyer(
        listingId, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
        newNoteHash, paymentHash, nullifier, ENC
      );

      expect(await gamingItemTrade.getNoteState(ITEM_NOTE_HASH)).to.equal(2); // Spent
      expect(await gamingItemTrade.getNoteState(newNoteHash)).to.equal(1);    // Valid
      expect(await gamingItemTrade.isNullifierUsed(nullifier)).to.be.true;
    });

    it("should release payment to seller", async function () {
      const sellerBefore = await mockToken.balanceOf(seller.address);
      await executeTrade(listingId);
      const sellerAfter = await mockToken.balanceOf(seller.address);
      expect(sellerAfter - sellerBefore).to.equal(PRICE);
    });

    it("should mark listing as inactive", async function () {
      await executeTrade(listingId);
      const listing = await gamingItemTrade.getListing(listingId);
      expect(listing.active).to.be.false;
    });

    it("should emit ItemTradeCompleted event", async function () {
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-note-evt"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-evt"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment-evt"));

      await expect(
        gamingItemTrade.connect(seller).executeTradeForBuyer(
          listingId, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
          newNoteHash, paymentHash, nullifier, ENC
        )
      ).to.emit(gamingItemTrade, "ItemTradeCompleted")
        .withArgs(listingId, ITEM_NOTE_HASH, newNoteHash);
    });

    it("should reject non-seller caller", async function () {
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-note-2"));
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-2"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment-2"));

      await expect(
        gamingItemTrade.connect(buyer).executeTradeForBuyer(
          listingId, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
          newNoteHash, paymentHash, nullifier, ENC
        )
      ).to.be.revertedWith("Only seller can execute trade");
    });

    it("should reject double-spend (reused nullifier)", async function () {
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("null-ds"));
      const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment-ds"));
      const newNoteHash = ethers.keccak256(ethers.toUtf8Bytes("new-note-ds"));

      // Complete first trade
      await gamingItemTrade.connect(seller).executeTradeForBuyer(
        listingId, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
        newNoteHash, paymentHash, nullifier, ENC
      );

      // Set up a second listing with a fresh note
      const hash3 = ethers.keccak256(ethers.toUtf8Bytes("item-note-3"));
      await gamingItemTrade.connect(seller).registerItem(hash3, GAME_ID, 999n, ENC);
      await gamingItemTrade.connect(seller).listItem(hash3, GAME_ID, 999n, PRICE);
      const listingId2 = (await gamingItemTrade.nextListingId()) - 1n;
      await purchase(listingId2);

      // Try to reuse the same nullifier
      await expect(
        gamingItemTrade.connect(seller).executeTradeForBuyer(
          listingId2, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
          ethers.keccak256(ethers.toUtf8Bytes("new-note-ds2")),
          paymentHash, nullifier, ENC
        )
      ).to.be.revertedWith("Nullifier already used");
    });

    it("should reject when no buyer yet", async function () {
      // Create new listing without purchase
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("item-note-nb"));
      await gamingItemTrade.connect(seller).registerItem(hash2, GAME_ID, 202n, ENC);
      await gamingItemTrade.connect(seller).listItem(hash2, GAME_ID, 202n, PRICE);
      const listingId2 = (await gamingItemTrade.nextListingId()) - 1n;

      await expect(
        gamingItemTrade.connect(seller).executeTradeForBuyer(
          listingId2, MOCK_PROOF.a, MOCK_PROOF.b, MOCK_PROOF.c,
          ethers.keccak256(ethers.toUtf8Bytes("new-nb")),
          ethers.keccak256(ethers.toUtf8Bytes("pay-nb")),
          ethers.keccak256(ethers.toUtf8Bytes("null-nb")),
          ENC
        )
      ).to.be.revertedWith("No buyer yet");
    });
  });

  // ─── cancelListing ──────────────────────────────────────────────────────────

  describe("cancelListing", function () {
    let listingId;

    beforeEach(async function () {
      ({ listingId } = await registerAndList());
    });

    it("should cancel listing without buyer", async function () {
      await gamingItemTrade.connect(seller).cancelListing(listingId);
      const listing = await gamingItemTrade.getListing(listingId);
      expect(listing.active).to.be.false;
    });

    it("should refund buyer when cancelling after purchase", async function () {
      await purchase(listingId);
      const buyerBefore = await mockToken.balanceOf(buyer.address);
      await gamingItemTrade.connect(seller).cancelListing(listingId);
      const buyerAfter = await mockToken.balanceOf(buyer.address);
      expect(buyerAfter - buyerBefore).to.equal(PRICE);
    });

    it("should emit ListingCancelled event", async function () {
      await expect(
        gamingItemTrade.connect(seller).cancelListing(listingId)
      ).to.emit(gamingItemTrade, "ListingCancelled")
        .withArgs(listingId);
    });

    it("should reject non-seller cancel", async function () {
      await expect(
        gamingItemTrade.connect(buyer).cancelListing(listingId)
      ).to.be.revertedWith("Only seller can cancel");
    });
  });

  // ─── getListings ────────────────────────────────────────────────────────────

  describe("getListings", function () {
    it("should return all listings", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("gl-note-1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("gl-note-2"));
      await gamingItemTrade.connect(seller).registerItem(hash1, GAME_ID, 501n, ENC);
      await gamingItemTrade.connect(seller).registerItem(hash2, GAME_ID, 502n, ENC);
      await gamingItemTrade.connect(seller).listItem(hash1, GAME_ID, 501n, PRICE);
      await gamingItemTrade.connect(seller).listItem(hash2, GAME_ID, 502n, PRICE);

      const listings = await gamingItemTrade.getListings();
      expect(listings.length).to.equal(2);
      expect(listings[0].itemNoteHash).to.equal(hash1);
      expect(listings[1].itemNoteHash).to.equal(hash2);
    });
  });
});
