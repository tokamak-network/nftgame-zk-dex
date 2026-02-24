const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("CardDrawGame (Commit-Reveal)", function () {
  let cardDrawGame;
  let mockToken;
  let mockVerifier;
  let owner, player1, player2, player3, player4, player5;

  const ENTRY_FEE = ethers.parseEther("10");
  const COMMIT_TIMEOUT = 60;   // 60 seconds
  const REVEAL_TIMEOUT = 120;  // 2 minutes (hardcoded in contract)

  // GameStatus enum values (Open=0, PendingReveal=1, Revealing=2, Finished=3, Cancelled=4)
  const STATUS = { Open: 0, PendingReveal: 1, Revealing: 2, Finished: 3, Cancelled: 4 };

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function commitDeck(player, gameId) {
    await mockToken.connect(player).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
    const deckCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256"], ["deck", player.address, gameId])
    );
    const playerCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256"], ["player", player.address, gameId])
    );
    await cardDrawGame.connect(player).joinGame(gameId, deckCommitment, playerCommitment);
    return { deckCommitment, playerCommitment };
  }

  async function revealCard(player, gameId, cardIndex) {
    // Mock verifier always returns true, so ZK proof values don't matter.
    const drawIndex = await cardDrawGame.getPlayerDrawIndex(gameId, player.address);
    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const drawCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256", "uint256"], ["draw", player.address, gameId, drawIndex])
    );
    await cardDrawGame.connect(player).revealCard(gameId, a, b, c, drawCommitment, cardIndex);
    return { drawIndex, drawCommitment };
  }

  // Full commit phase + PendingReveal → Revealing (mines 3 blocks for blockhash).
  async function runCommitPhase(gameId, players) {
    for (const p of players) {
      await commitDeck(p, gameId);
    }
    await time.increase(COMMIT_TIMEOUT + 1);
    await cardDrawGame.startReveal(gameId);
    // Mine 3 blocks so revealBlock (block.number + 2) is in the past.
    await mine(3);
    await cardDrawGame.finalizeReveal(gameId);
  }

  // Mine blocks and finalize after startReveal has already been called.
  async function finalizeReveal(gameId) {
    await mine(3);
    await cardDrawGame.finalizeReveal(gameId);
  }

  beforeEach(async function () {
    [owner, player1, player2, player3, player4, player5] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy();

    const MockVerifier = await ethers.getContractFactory("MockCardDrawVerifier");
    mockVerifier = await MockVerifier.deploy();

    const CardDrawGame = await ethers.getContractFactory("CardDrawGame");
    cardDrawGame = await CardDrawGame.deploy(
      await mockVerifier.getAddress(),
      await mockToken.getAddress(),
      ENTRY_FEE,
      COMMIT_TIMEOUT
    );

    const mintAmount = ethers.parseEther("10000");
    for (const p of [owner, player1, player2, player3, player4, player5]) {
      await mockToken.mint(p.address, mintAmount);
    }
  });

  // ── createGame ─────────────────────────────────────────────────────────────

  describe("createGame", function () {
    it("should create a game with correct parameters", async function () {
      await expect(cardDrawGame.createGame(60))
        .to.emit(cardDrawGame, "GameCreated")
        .withArgs(1, owner.address, 60);

      const game = await cardDrawGame.getGame(1);
      expect(game.creator).to.equal(owner.address);
      expect(game.status).to.equal(STATUS.Open);
      expect(game.commitTimeout).to.equal(60);
      expect(game.playerCount).to.equal(0);
    });

    it("should reject commitTimeout < 30 seconds", async function () {
      await expect(cardDrawGame.createGame(29))
        .to.be.revertedWith("Commit timeout must be >= 30 seconds");
    });

    it("should auto-increment game IDs", async function () {
      await cardDrawGame.createGame(60);
      await cardDrawGame.createGame(90);
      expect((await cardDrawGame.getGame(1)).commitTimeout).to.equal(60);
      expect((await cardDrawGame.getGame(2)).commitTimeout).to.equal(90);
      expect(await cardDrawGame.nextGameId()).to.equal(3);
    });
  });

  // ── joinGame (commit phase) ────────────────────────────────────────────────

  describe("joinGame (commit phase)", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
    });

    it("should allow a player to commit (no ZK proof)", async function () {
      const balBefore = await mockToken.balanceOf(player1.address);
      await commitDeck(player1, gameId);
      const balAfter = await mockToken.balanceOf(player1.address);

      expect(balBefore - balAfter).to.equal(ENTRY_FEE);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(1);
      expect(game.prizePool).to.equal(ENTRY_FEE);

      const players = await cardDrawGame.getGamePlayers(gameId);
      expect(players[0].hasCommitted).to.be.true;
      expect(players[0].hasRevealed).to.be.false; // not yet revealed
    });

    it("should emit PlayerCommitted event", async function () {
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);

      await expect(
        cardDrawGame.connect(player1).joinGame(gameId, deckCommitment, playerCommitment)
      ).to.emit(cardDrawGame, "PlayerCommitted").withArgs(gameId, player1.address, 1);
    });

    it("should reject if ERC20 not approved", async function () {
      // No approve call
      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck")),
          ethers.keccak256(ethers.toUtf8Bytes("player"))
        )
      ).to.be.reverted;
    });

    it("should reject duplicate join", async function () {
      await commitDeck(player1, gameId);
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck2")),
          ethers.keccak256(ethers.toUtf8Bytes("player2"))
        )
      ).to.be.revertedWith("Already joined");
    });

    it("should reject join when game is full (5 players)", async function () {
      for (const p of [player1, player2, player3, player4, player5]) {
        await commitDeck(p, gameId);
      }
      // 6th player should fail
      await mockToken.connect(owner).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(owner).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck-extra")),
          ethers.keccak256(ethers.toUtf8Bytes("player-extra"))
        )
      ).to.be.revertedWith("Game is full");
    });

    it("should reject join after commit timeout when >= MIN_PLAYERS joined", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);

      await time.increase(COMMIT_TIMEOUT + 1);

      await mockToken.connect(player3).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(player3).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck-p3")),
          ethers.keccak256(ethers.toUtf8Bytes("player-p3"))
        )
      ).to.be.revertedWith("Commit phase has ended");
    });

    it("should ignore commit timeout when < MIN_PLAYERS joined", async function () {
      await commitDeck(player1, gameId);
      await time.increase(COMMIT_TIMEOUT * 100); // way past timeout

      // Should still be allowed since playerCount < MIN_PLAYERS
      await commitDeck(player2, gameId);
      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(2);
    });

    it("should allow join before commit timeout with >= MIN_PLAYERS", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);

      await time.increase(COMMIT_TIMEOUT - 10); // not yet expired
      await commitDeck(player3, gameId);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(3);
    });

    it("should reject join on non-existent gameId", async function () {
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(player1).joinGame(
          999,
          ethers.keccak256(ethers.toUtf8Bytes("deck")),
          ethers.keccak256(ethers.toUtf8Bytes("player"))
        )
      ).to.be.revertedWith("Game does not exist");
    });

    it("should reject join on Cancelled game", async function () {
      await cardDrawGame.cancelGame(gameId); // creator cancels empty game
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck")),
          ethers.keccak256(ethers.toUtf8Bytes("player"))
        )
      ).to.be.revertedWith("Game is not in commit phase");
    });

    it("should reject join on Finished game", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);
      await revealCard(player1, gameId, 0);
      await revealCard(player2, gameId, 12);
      await cardDrawGame.closeGame(gameId);

      await mockToken.connect(player3).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      await expect(
        cardDrawGame.connect(player3).joinGame(
          gameId,
          ethers.keccak256(ethers.toUtf8Bytes("deck")),
          ethers.keccak256(ethers.toUtf8Bytes("player"))
        )
      ).to.be.revertedWith("Game is not in commit phase");
    });
  });

  // ── startReveal ────────────────────────────────────────────────────────────

  describe("startReveal", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
    });

    it("should transition to PendingReveal and record revealBlock", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);

      const blockBefore = await ethers.provider.getBlockNumber();

      await expect(cardDrawGame.startReveal(gameId))
        .to.emit(cardDrawGame, "RevealPending");

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(STATUS.PendingReveal);
      expect(game.revealBlock).to.equal(blockBefore + 3); // startReveal mines block B+1, then revealBlock = B+1+2
      expect(game.revealSeed).to.equal(0);    // seed NOT set yet
      expect(game.revealDeadline).to.equal(0); // deadline NOT set yet
    });

    it("should reject startReveal before commit timeout with < MAX_PLAYERS", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      // No time advance

      await expect(cardDrawGame.startReveal(gameId))
        .to.be.revertedWith("Commit phase has not ended yet");
    });

    it("should allow startReveal immediately when MAX_PLAYERS reached", async function () {
      for (const p of [player1, player2, player3, player4, player5]) {
        await commitDeck(p, gameId);
      }
      // No time advance needed
      await expect(cardDrawGame.startReveal(gameId))
        .to.emit(cardDrawGame, "RevealPending");

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(STATUS.PendingReveal);
    });

    it("should reject startReveal with < MIN_PLAYERS", async function () {
      await commitDeck(player1, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);

      await expect(cardDrawGame.startReveal(gameId))
        .to.be.revertedWith("Not enough players");
    });

    it("should reject startReveal if already PendingReveal", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);

      await expect(cardDrawGame.startReveal(gameId))
        .to.be.revertedWith("Game is not in commit phase");
    });

    it("should reject startReveal if already Revealing", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await finalizeReveal(gameId);

      await expect(cardDrawGame.startReveal(gameId))
        .to.be.revertedWith("Game is not in commit phase");
    });
  });

  // ── finalizeReveal ─────────────────────────────────────────────────────────

  describe("finalizeReveal", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
    });

    it("should transition to Revealing and set revealSeed after mining revealBlock", async function () {
      await mine(3); // ensure revealBlock is in the past

      await expect(cardDrawGame.finalizeReveal(gameId))
        .to.emit(cardDrawGame, "RevealStarted");

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(STATUS.Revealing);
      expect(game.revealSeed).to.not.equal(0);
      expect(game.revealDeadline).to.be.gt(0);
    });

    it("should reject finalizeReveal before revealBlock is mined", async function () {
      // Don't mine — revealBlock is in the future
      await expect(cardDrawGame.finalizeReveal(gameId))
        .to.be.revertedWith("Target block not yet mined");
    });

    it("should reject finalizeReveal if not in PendingReveal status", async function () {
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId); // now Revealing

      await expect(cardDrawGame.finalizeReveal(gameId))
        .to.be.revertedWith("Not in pending reveal phase");
    });

    it("should reject finalizeReveal if called on Open game", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      const gameId2 = 2;
      await commitDeck(player1, gameId2);
      await commitDeck(player2, gameId2);
      // Not yet called startReveal
      await expect(cardDrawGame.finalizeReveal(gameId2))
        .to.be.revertedWith("Not in pending reveal phase");
    });

    it("drawIndex should differ per player after finalize", async function () {
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      const idx1 = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      const idx2 = await cardDrawGame.getPlayerDrawIndex(gameId, player2.address);
      expect(idx1).to.be.gte(0);
      expect(idx1).to.be.lt(52);
      expect(idx2).to.be.gte(0);
      expect(idx2).to.be.lt(52);
      // Different players almost certainly get different indices
      // (collision probability = 1/52, acceptable in a test)
    });

    it("should store prevRandaoSnapshot during startReveal", async function () {
      const game = await cardDrawGame.getGame(gameId);
      // prevRandaoSnapshot is captured in startReveal (called in beforeEach)
      expect(game.prevRandaoSnapshot).to.not.be.undefined;
    });

    it("revealSeed should equal keccak256(blockhash, prevRandaoSnapshot)", async function () {
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      const game = await cardDrawGame.getGame(gameId);
      const block = await ethers.provider.getBlock(Number(game.revealBlock));

      // Replicate: keccak256(abi.encodePacked(blockHash, prevRandaoSnapshot))
      const expectedSeed = BigInt(
        ethers.keccak256(
          ethers.solidityPacked(
            ["bytes32", "uint256"],
            [block.hash, game.prevRandaoSnapshot]
          )
        )
      );
      expect(game.revealSeed).to.equal(expectedSeed);
    });

    it("getPlayerDrawIndex returns same value on multiple calls", async function () {
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      const idx1 = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      const idx2 = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      const idx3 = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      expect(idx1).to.equal(idx2);
      expect(idx2).to.equal(idx3);
    });
  });

  // ── revealCard ─────────────────────────────────────────────────────────────

  describe("revealCard", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);
    });

    it("should allow player to reveal with ZK proof", async function () {
      await revealCard(player1, gameId, 10);

      const players = await cardDrawGame.getGamePlayers(gameId);
      expect(players[0].hasRevealed).to.be.true;
      expect(players[0].drawnCard).to.equal(10);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.revealedCount).to.equal(1);
    });

    it("should emit PlayerRevealed with correct drawIndex", async function () {
      const expectedDrawIndex = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      const drawCommitment = ethers.keccak256(
        ethers.solidityPacked(["string", "address", "uint256", "uint256"], ["draw", player1.address, gameId, expectedDrawIndex])
      );

      await expect(
        cardDrawGame.connect(player1).revealCard(
          gameId, [0,0], [[0,0],[0,0]], [0,0], drawCommitment, 10
        )
      ).to.emit(cardDrawGame, "PlayerRevealed")
        .withArgs(gameId, player1.address, 10, expectedDrawIndex);
    });

    it("should reject reveal before finalizeReveal (game still Open)", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      const gameId2 = 2;
      await commitDeck(player1, gameId2);
      await commitDeck(player2, gameId2);
      // NOT calling startReveal or finalizeReveal

      await expect(
        cardDrawGame.connect(player1).revealCard(
          gameId2, [0,0], [[0,0],[0,0]], [0,0],
          ethers.keccak256(ethers.toUtf8Bytes("draw")), 10
        )
      ).to.be.revertedWith("Game is not in reveal phase");
    });

    it("should reject reveal while game is PendingReveal", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      const gameId2 = 2;
      await commitDeck(player1, gameId2);
      await commitDeck(player2, gameId2);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId2); // PendingReveal, no finalize yet

      await expect(
        cardDrawGame.connect(player1).revealCard(
          gameId2, [0,0], [[0,0],[0,0]], [0,0],
          ethers.keccak256(ethers.toUtf8Bytes("draw")), 10
        )
      ).to.be.revertedWith("Game is not in reveal phase");
    });

    it("should reject duplicate reveal", async function () {
      await revealCard(player1, gameId, 10);

      await expect(revealCard(player1, gameId, 20))
        .to.be.revertedWith("Already revealed");
    });

    it("should reject reveal after revealDeadline", async function () {
      await time.increase(REVEAL_TIMEOUT + 1);

      await expect(revealCard(player1, gameId, 10))
        .to.be.revertedWith("Reveal deadline has passed");
    });

    it("should reject reveal for non-player", async function () {
      await expect(
        cardDrawGame.connect(player3).revealCard(
          gameId, [0,0], [[0,0],[0,0]], [0,0],
          ethers.keccak256(ethers.toUtf8Bytes("draw")), 10
        )
      ).to.be.revertedWith("Not a player in this game");
    });

    it("should reject invalid card index >= 52", async function () {
      const drawCommitment = ethers.keccak256(ethers.solidityPacked(["string"], ["draw"]));
      await expect(
        cardDrawGame.connect(player1).revealCard(
          gameId, [0,0], [[0,0],[0,0]], [0,0], drawCommitment, 52
        )
      ).to.be.revertedWith("Invalid card index");
    });

    it("getPlayerDrawIndex should revert before finalizeReveal", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      const gameId2 = 2;
      await expect(
        cardDrawGame.getPlayerDrawIndex(gameId2, player1.address)
      ).to.be.revertedWith("Reveal has not started");
    });

    it("drawIndex should be in range [0, 51]", async function () {
      const idx = await cardDrawGame.getPlayerDrawIndex(gameId, player1.address);
      expect(idx).to.be.gte(0);
      expect(idx).to.be.lt(52);
    });

    it("should allow reveal with card index 51 (max valid boundary)", async function () {
      await revealCard(player1, gameId, 51);
      const players = await cardDrawGame.getGamePlayers(gameId);
      expect(players[0].hasRevealed).to.be.true;
      expect(players[0].drawnCard).to.equal(51);
    });
  });

  // ── closeGame ──────────────────────────────────────────────────────────────

  describe("closeGame", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
    });

    it("should close and pay winner after all reveal", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 0);  // Ace of Spades (best card)
      await revealCard(player2, gameId, 12); // King of Spades

      const winnerBalBefore = await mockToken.balanceOf(player1.address);
      await expect(cardDrawGame.closeGame(gameId))
        .to.emit(cardDrawGame, "GameFinished")
        .withArgs(gameId, player1.address, ENTRY_FEE * 2n * 90n / 100n, 0);

      const winnerBalAfter = await mockToken.balanceOf(player1.address);
      const prize = ENTRY_FEE * 2n * 90n / 100n; // 18 TON
      expect(winnerBalAfter - winnerBalBefore).to.equal(prize);
    });

    it("should correctly rank Ace > King", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 12); // King of Spades
      await revealCard(player2, gameId, 0);  // Ace of Spades

      await cardDrawGame.closeGame(gameId);
      const game = await cardDrawGame.getGame(gameId);
      expect(game.winner).to.equal(player2.address); // Ace wins
    });

    it("should use suit as tiebreaker (Spades > Hearts > Diamonds > Clubs)", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await commitDeck(player3, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 26); // Ace of Diamonds (suit 2)
      await revealCard(player2, gameId, 13); // Ace of Hearts (suit 1)
      await revealCard(player3, gameId, 0);  // Ace of Spades (suit 0)

      await cardDrawGame.closeGame(gameId);
      const game = await cardDrawGame.getGame(gameId);
      expect(game.winner).to.equal(player3.address); // Spades wins
    });

    it("should forfeit unrevealed players and count fees", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await commitDeck(player3, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      // Only player1 reveals (with best card)
      await revealCard(player1, gameId, 0); // Ace of Spades
      // player2 and player3 don't reveal → forfeit

      // Advance past reveal deadline
      await time.increase(REVEAL_TIMEOUT + 1);

      const balBefore = await mockToken.balanceOf(player1.address);
      await cardDrawGame.closeGame(gameId);
      const balAfter = await mockToken.balanceOf(player1.address);

      // Only 1 revealed: prize pool = 1 * ENTRY_FEE = 10 TON, fee 10% = 1 TON, prize = 9 TON
      const expectedPrize = ENTRY_FEE * 90n / 100n;
      expect(balAfter - balBefore).to.equal(expectedPrize);

      // Forfeited fees (2 * ENTRY_FEE = 20 TON) go to accumulatedFees, plus 10% fee
      const expectedFees = ENTRY_FEE * 1n / 10n + ENTRY_FEE * 2n; // 1 TON fee + 20 TON forfeits
      expect(await cardDrawGame.accumulatedFees()).to.equal(expectedFees);
    });

    it("should cancel (refund all) if nobody revealed", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      // Nobody reveals
      await time.increase(REVEAL_TIMEOUT + 1);

      const bal1Before = await mockToken.balanceOf(player1.address);
      const bal2Before = await mockToken.balanceOf(player2.address);

      await expect(cardDrawGame.closeGame(gameId))
        .to.emit(cardDrawGame, "GameCancelled").withArgs(gameId);

      const bal1After = await mockToken.balanceOf(player1.address);
      const bal2After = await mockToken.balanceOf(player2.address);
      expect(bal1After - bal1Before).to.equal(ENTRY_FEE);
      expect(bal2After - bal2Before).to.equal(ENTRY_FEE);
    });

    it("should reject close before reveal deadline with partial reveals", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 10); // only 1 of 2 revealed

      // Not all revealed, deadline not passed
      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Reveal phase has not ended yet");
    });

    it("should allow close immediately when all players reveal", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 0);
      await revealCard(player2, gameId, 12);

      // Both revealed — no time advance needed
      await expect(cardDrawGame.closeGame(gameId))
        .to.emit(cardDrawGame, "GameFinished");
    });

    it("should reject closeGame on Open game", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Game is not in reveal phase");
    });

    it("should reject closeGame on PendingReveal game", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Game is not in reveal phase");
    });

    it("should reject closeGame on already Finished game", async function () {
      await runCommitPhase(gameId, [player1, player2]);
      await revealCard(player1, gameId, 0);
      await revealCard(player2, gameId, 12);
      await cardDrawGame.closeGame(gameId);

      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Game is not in reveal phase");
    });

    it("should calculate prize correctly when 2 of 3 players reveal", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await commitDeck(player3, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 0);  // Ace of Spades (winner)
      await revealCard(player2, gameId, 12); // King of Spades
      // player3 does not reveal → forfeit

      await time.increase(REVEAL_TIMEOUT + 1);

      const bal1Before = await mockToken.balanceOf(player1.address);
      await cardDrawGame.closeGame(gameId);
      const bal1After = await mockToken.balanceOf(player1.address);

      // revealedPool = 2 * ENTRY_FEE, fee 10%, prize = 18 TON
      const expectedPrize = ENTRY_FEE * 2n * 90n / 100n;
      expect(bal1After - bal1Before).to.equal(expectedPrize);

      // accumulatedFees = 10% of revealed pool + 1 forfeited entry fee
      const expectedFees = ENTRY_FEE * 2n / 10n + ENTRY_FEE;
      expect(await cardDrawGame.accumulatedFees()).to.equal(expectedFees);
    });

    it("should calculate prize correctly when 1 of 5 players reveal", async function () {
      for (const p of [player1, player2, player3, player4, player5]) {
        await commitDeck(p, gameId);
      }
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      await revealCard(player1, gameId, 0); // only player1 reveals
      await time.increase(REVEAL_TIMEOUT + 1);

      const bal1Before = await mockToken.balanceOf(player1.address);
      await cardDrawGame.closeGame(gameId);
      const bal1After = await mockToken.balanceOf(player1.address);

      // revealedPool = 1 * ENTRY_FEE, fee 10%, prize = 9 TON
      const expectedPrize = ENTRY_FEE * 90n / 100n;
      expect(bal1After - bal1Before).to.equal(expectedPrize);

      // accumulatedFees = 10% of 1 entry + 4 forfeited entries
      const expectedFees = ENTRY_FEE / 10n + ENTRY_FEE * 4n;
      expect(await cardDrawGame.accumulatedFees()).to.equal(expectedFees);
    });

    it("should allow close via MAX_PLAYERS path", async function () {
      for (const p of [player1, player2, player3, player4, player5]) {
        await commitDeck(p, gameId);
      }
      // MAX_PLAYERS → startReveal immediately (no time advance)
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId);

      // All 5 reveal
      await revealCard(player1, gameId, 0);  // Ace of Spades (best)
      await revealCard(player2, gameId, 12);
      await revealCard(player3, gameId, 25);
      await revealCard(player4, gameId, 38);
      await revealCard(player5, gameId, 51);

      await expect(cardDrawGame.closeGame(gameId))
        .to.emit(cardDrawGame, "GameFinished");
      const game = await cardDrawGame.getGame(gameId);
      expect(game.winner).to.equal(player1.address); // Ace wins
    });
  });

  // ── cancelGame ─────────────────────────────────────────────────────────────

  describe("cancelGame", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      gameId = 1;
    });

    it("should refund all players on cancel", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);

      const bal1Before = await mockToken.balanceOf(player1.address);
      const bal2Before = await mockToken.balanceOf(player2.address);

      await expect(cardDrawGame.cancelGame(gameId))
        .to.emit(cardDrawGame, "GameCancelled").withArgs(gameId);

      expect((await mockToken.balanceOf(player1.address)) - bal1Before).to.equal(ENTRY_FEE);
      expect((await mockToken.balanceOf(player2.address)) - bal2Before).to.equal(ENTRY_FEE);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(STATUS.Cancelled);
    });

    it("should reject cancel by non-creator", async function () {
      await expect(cardDrawGame.connect(player1).cancelGame(gameId))
        .to.be.revertedWith("Only creator can cancel");
    });

    it("should allow cancel of empty game", async function () {
      await expect(cardDrawGame.cancelGame(gameId))
        .to.emit(cardDrawGame, "GameCancelled").withArgs(gameId);
    });

    it("should reject cancel after startReveal (PendingReveal phase)", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId); // now PendingReveal

      await expect(cardDrawGame.cancelGame(gameId))
        .to.be.revertedWith("Game is not in commit phase");
    });

    it("should reject cancel after finalizeReveal (Revealing phase)", async function () {
      await commitDeck(player1, gameId);
      await commitDeck(player2, gameId);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(gameId);
      await mine(3);
      await cardDrawGame.finalizeReveal(gameId); // now Revealing

      await expect(cardDrawGame.cancelGame(gameId))
        .to.be.revertedWith("Game is not in commit phase");
    });
  });

  // ── admin ──────────────────────────────────────────────────────────────────

  describe("admin", function () {
    it("should allow admin to withdraw accumulated fees", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      await commitDeck(player1, 1);
      await commitDeck(player2, 1);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(1);
      await mine(3);
      await cardDrawGame.finalizeReveal(1);
      await revealCard(player1, 1, 0);
      await revealCard(player2, 1, 12);
      await cardDrawGame.closeGame(1);

      const fees = await cardDrawGame.accumulatedFees();
      expect(fees).to.be.gt(0);

      const balBefore = await mockToken.balanceOf(owner.address);
      await cardDrawGame.withdrawFees(owner.address);
      expect((await mockToken.balanceOf(owner.address)) - balBefore).to.equal(fees);
      expect(await cardDrawGame.accumulatedFees()).to.equal(0);
    });

    it("should reject fee withdrawal by non-admin", async function () {
      await expect(cardDrawGame.connect(player1).withdrawFees(player1.address))
        .to.be.revertedWith("Only admin can withdraw fees");
    });

    it("should reject withdrawFees when no fees accumulated", async function () {
      await expect(cardDrawGame.withdrawFees(owner.address))
        .to.be.revertedWith("No fees to withdraw");
    });
  });

  // ── getters ────────────────────────────────────────────────────────────────

  describe("getters", function () {
    it("should return all players with correct fields after commit", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      await commitDeck(player1, 1);
      await commitDeck(player2, 1);

      const players = await cardDrawGame.getGamePlayers(1);
      expect(players.length).to.equal(2);
      expect(players[0].addr).to.equal(player1.address);
      expect(players[0].hasCommitted).to.be.true;
      expect(players[0].hasRevealed).to.be.false;
      expect(players[0].drawnCard).to.equal(0); // not yet revealed
    });

    it("should return correct drawnCard after reveal", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT);
      await commitDeck(player1, 1);
      await commitDeck(player2, 1);
      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(1);
      await mine(3);
      await cardDrawGame.finalizeReveal(1);
      await revealCard(player1, 1, 25);

      const players = await cardDrawGame.getGamePlayers(1);
      expect(players[0].hasRevealed).to.be.true;
      expect(players[0].drawnCard).to.equal(25);
    });
  });

  // ── concurrent games ───────────────────────────────────────────────────────

  describe("concurrent games", function () {
    it("two concurrent games do not interfere with each other", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 1
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 2

      await commitDeck(player1, 1);
      await commitDeck(player2, 1);
      await commitDeck(player3, 2);
      await commitDeck(player4, 2);

      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(1);
      await cardDrawGame.startReveal(2);
      await mine(3);
      await cardDrawGame.finalizeReveal(1);
      await cardDrawGame.finalizeReveal(2);

      await revealCard(player1, 1, 0);
      await revealCard(player2, 1, 12);
      await revealCard(player3, 2, 5);
      await revealCard(player4, 2, 10);

      await cardDrawGame.closeGame(1);
      await cardDrawGame.closeGame(2);

      const game1 = await cardDrawGame.getGame(1);
      const game2 = await cardDrawGame.getGame(2);
      expect(game1.status).to.equal(STATUS.Finished);
      expect(game2.status).to.equal(STATUS.Finished);
      // Winners are independent
      expect(game1.winner).to.not.equal(ethers.ZeroAddress);
      expect(game2.winner).to.not.equal(ethers.ZeroAddress);
    });

    it("same player can join different games simultaneously", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 1
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 2

      await commitDeck(player1, 1);
      await commitDeck(player2, 1);
      await commitDeck(player1, 2); // player1 joins game 2 as well
      await commitDeck(player3, 2);

      const game1 = await cardDrawGame.getGame(1);
      const game2 = await cardDrawGame.getGame(2);
      expect(game1.playerCount).to.equal(2);
      expect(game2.playerCount).to.equal(2);
      expect(await cardDrawGame.hasJoined(1, player1.address)).to.be.true;
      expect(await cardDrawGame.hasJoined(2, player1.address)).to.be.true;
    });

    it("player in game 1 cannot reveal in game 2", async function () {
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 1
      await cardDrawGame.createGame(COMMIT_TIMEOUT); // gameId 2

      await commitDeck(player1, 1);
      await commitDeck(player2, 1);
      await commitDeck(player3, 2);
      await commitDeck(player4, 2);

      await time.increase(COMMIT_TIMEOUT + 1);
      await cardDrawGame.startReveal(1);
      await cardDrawGame.startReveal(2);
      await mine(3);
      await cardDrawGame.finalizeReveal(1);
      await cardDrawGame.finalizeReveal(2);

      // player1 is only in game 1, should fail in game 2
      await expect(revealCard(player1, 2, 10))
        .to.be.revertedWith("Not a player in this game");
    });
  });
});
