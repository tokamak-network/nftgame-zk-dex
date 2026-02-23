const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CardDrawGame", function () {
  let cardDrawGame;
  let mockToken;
  let mockVerifier;
  let owner, player1, player2, player3, player4, player5;

  const ENTRY_FEE = ethers.parseEther("10");
  const DEFAULT_TIMEOUT = 60;

  // Helper: approve and join a game with a specific card
  async function joinWithCard(player, gameId, cardIndex) {
    await mockToken.connect(player).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const c = [0, 0];
    const deckCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256"], ["deck", player.address, gameId])
    );
    const drawCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256"], ["draw", player.address, gameId])
    );
    const playerCommitment = ethers.keccak256(
      ethers.solidityPacked(["string", "address", "uint256"], ["player", player.address, gameId])
    );

    await cardDrawGame.connect(player).joinGame(
      gameId, a, b, c,
      deckCommitment, drawCommitment, 0, playerCommitment, cardIndex
    );
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
      DEFAULT_TIMEOUT
    );

    // Mint tokens to all players
    const mintAmount = ethers.parseEther("10000");
    for (const player of [owner, player1, player2, player3, player4, player5]) {
      await mockToken.mint(player.address, mintAmount);
    }
  });

  describe("createGame", function () {
    it("should create a game with correct parameters", async function () {
      const tx = await cardDrawGame.createGame(60);
      await expect(tx).to.emit(cardDrawGame, "GameCreated").withArgs(1, owner.address, 60);

      const game = await cardDrawGame.getGame(1);
      expect(game.creator).to.equal(owner.address);
      expect(game.status).to.equal(0); // Open
      expect(game.timeout).to.equal(60);
      expect(game.playerCount).to.equal(0);
    });

    it("should reject timeout less than 30 seconds", async function () {
      await expect(cardDrawGame.createGame(29))
        .to.be.revertedWith("Timeout must be >= 30 seconds");
    });

    it("should auto-increment game IDs", async function () {
      await cardDrawGame.createGame(60);
      await cardDrawGame.createGame(90);
      await cardDrawGame.createGame(120);

      expect((await cardDrawGame.getGame(1)).timeout).to.equal(60);
      expect((await cardDrawGame.getGame(2)).timeout).to.equal(90);
      expect((await cardDrawGame.getGame(3)).timeout).to.equal(120);
      expect(await cardDrawGame.nextGameId()).to.equal(4);
    });
  });

  describe("joinGame", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      gameId = 1;
    });

    it("should allow a player to join and pay entry fee", async function () {
      const balBefore = await mockToken.balanceOf(player1.address);
      await joinWithCard(player1, gameId, 10); // 10 = Jack of Spades
      const balAfter = await mockToken.balanceOf(player1.address);

      expect(balBefore - balAfter).to.equal(ENTRY_FEE);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(1);
      expect(game.prizePool).to.equal(ENTRY_FEE);
    });

    it("should reject if ERC20 not approved", async function () {
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      // No approve call
      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId, a, b, c,
          deckCommitment, drawCommitment, 0, playerCommitment, 10
        )
      ).to.be.reverted;
    });

    it("should reject duplicate join", async function () {
      await joinWithCard(player1, gameId, 10);

      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck2"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw2"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player2"));

      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId, a, b, c,
          deckCommitment, drawCommitment, 0, playerCommitment, 20
        )
      ).to.be.revertedWith("Already joined this game");
    });

    it("should reject more than MAX_PLAYERS (5)", async function () {
      // Join 5 players
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);
      await joinWithCard(player3, gameId, 30);
      await joinWithCard(player4, gameId, 40);
      await joinWithCard(player5, gameId, 50);

      // 6th player (owner) should fail
      await mockToken.connect(owner).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-owner"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw-owner"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player-owner"));

      await expect(
        cardDrawGame.connect(owner).joinGame(
          gameId, a, b, c,
          deckCommitment, drawCommitment, 0, playerCommitment, 5
        )
      ).to.be.revertedWith("Game is full");
    });

    it("should reject join after timeout when playerCount >= 2", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);

      // Advance past timeout
      await time.increase(DEFAULT_TIMEOUT + 1);

      await mockToken.connect(player3).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-p3"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw-p3"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player-p3"));

      await expect(
        cardDrawGame.connect(player3).joinGame(
          gameId, a, b, c,
          deckCommitment, drawCommitment, 0, playerCommitment, 30
        )
      ).to.be.revertedWith("Join window has expired");
    });

    it("should allow join before timeout when playerCount >= 2", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);

      // Advance but not past timeout
      await time.increase(DEFAULT_TIMEOUT - 10);

      await joinWithCard(player3, gameId, 30);
      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(3);
    });

    it("should ignore timeout when playerCount < 2", async function () {
      await joinWithCard(player1, gameId, 10);

      // Advance way past timeout - should still allow join since < MIN_PLAYERS
      await time.increase(DEFAULT_TIMEOUT * 100);

      await joinWithCard(player2, gameId, 20);
      const game = await cardDrawGame.getGame(gameId);
      expect(game.playerCount).to.equal(2);
    });

    it("should reject invalid card index >= 52", async function () {
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player"));

      await expect(
        cardDrawGame.connect(player1).joinGame(
          gameId, a, b, c,
          deckCommitment, drawCommitment, 0, playerCommitment, 52
        )
      ).to.be.revertedWith("Invalid card index");
    });

    it("should emit PlayerJoined and PlayerDrew events", async function () {
      await mockToken.connect(player1).approve(await cardDrawGame.getAddress(), ENTRY_FEE);
      const a = [0, 0];
      const b = [[0, 0], [0, 0]];
      const c = [0, 0];
      const deckCommitment = ethers.keccak256(ethers.toUtf8Bytes("deck-evt"));
      const drawCommitment = ethers.keccak256(ethers.toUtf8Bytes("draw-evt"));
      const playerCommitment = ethers.keccak256(ethers.toUtf8Bytes("player-evt"));

      const tx = cardDrawGame.connect(player1).joinGame(
        gameId, a, b, c,
        deckCommitment, drawCommitment, 0, playerCommitment, 25
      );

      await expect(tx).to.emit(cardDrawGame, "PlayerJoined").withArgs(gameId, player1.address, 1);
      await expect(tx).to.emit(cardDrawGame, "PlayerDrew").withArgs(gameId, player1.address, 25);
    });
  });

  describe("closeGame", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      gameId = 1;
    });

    it("should close game and pay winner after timeout", async function () {
      // Player1 draws card 0 (Ace of Spades = best card)
      // Player2 draws card 12 (King of Spades = second best)
      await joinWithCard(player1, gameId, 0);  // Ace of Spades
      await joinWithCard(player2, gameId, 12); // King of Spades

      // Advance past timeout
      await time.increase(DEFAULT_TIMEOUT + 1);

      const winnerBalBefore = await mockToken.balanceOf(player1.address);
      const tx = await cardDrawGame.closeGame(gameId);

      const prize = ENTRY_FEE * 2n * 90n / 100n; // 20 TON - 10% fee = 18 TON
      await expect(tx).to.emit(cardDrawGame, "GameFinished")
        .withArgs(gameId, player1.address, prize, 0); // card 0 = Ace of Spades

      const winnerBalAfter = await mockToken.balanceOf(player1.address);
      expect(winnerBalAfter - winnerBalBefore).to.equal(prize);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(1); // Finished
      expect(game.winner).to.equal(player1.address);
    });

    it("should correctly rank Ace > King", async function () {
      // Card 0 = Ace of Spades (rank 0 → value 14)
      // Card 12 = King of Spades (rank 12 → value 13)
      await joinWithCard(player1, gameId, 12); // King of Spades
      await joinWithCard(player2, gameId, 0);  // Ace of Spades

      await time.increase(DEFAULT_TIMEOUT + 1);
      await cardDrawGame.closeGame(gameId);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.winner).to.equal(player2.address); // Ace wins
    });

    it("should use suit as tiebreaker (Spades > Hearts > Diamonds > Clubs)", async function () {
      // Card 0 = Ace of Spades (suit 0)
      // Card 13 = Ace of Hearts (suit 1)
      // Card 26 = Ace of Diamonds (suit 2)
      await joinWithCard(player1, gameId, 26); // Ace of Diamonds
      await joinWithCard(player2, gameId, 13); // Ace of Hearts
      await joinWithCard(player3, gameId, 0);  // Ace of Spades

      await time.increase(DEFAULT_TIMEOUT + 1);
      await cardDrawGame.closeGame(gameId);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.winner).to.equal(player3.address); // Spades wins
    });

    it("should reject close before timeout with < MAX_PLAYERS", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);

      // Don't advance time
      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Game cannot be closed yet");
    });

    it("should reject close with less than MIN_PLAYERS", async function () {
      await joinWithCard(player1, gameId, 10);
      await time.increase(DEFAULT_TIMEOUT + 1);

      await expect(cardDrawGame.closeGame(gameId))
        .to.be.revertedWith("Not enough players");
    });

    it("should allow immediate close when MAX_PLAYERS reached", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);
      await joinWithCard(player3, gameId, 30);
      await joinWithCard(player4, gameId, 40);
      await joinWithCard(player5, gameId, 50);

      // No time advancement needed
      await expect(cardDrawGame.closeGame(gameId))
        .to.emit(cardDrawGame, "GameFinished");
    });

    it("should accumulate fees correctly", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);
      await time.increase(DEFAULT_TIMEOUT + 1);

      await cardDrawGame.closeGame(gameId);

      const expectedFee = ENTRY_FEE * 2n * 10n / 100n; // 10% of 20 TON = 2 TON
      expect(await cardDrawGame.accumulatedFees()).to.equal(expectedFee);
    });
  });

  describe("cancelGame", function () {
    let gameId;

    beforeEach(async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      gameId = 1;
    });

    it("should refund all players on cancel", async function () {
      await joinWithCard(player1, gameId, 10);
      await joinWithCard(player2, gameId, 20);

      const bal1Before = await mockToken.balanceOf(player1.address);
      const bal2Before = await mockToken.balanceOf(player2.address);

      await expect(cardDrawGame.cancelGame(gameId))
        .to.emit(cardDrawGame, "GameCancelled")
        .withArgs(gameId);

      const bal1After = await mockToken.balanceOf(player1.address);
      const bal2After = await mockToken.balanceOf(player2.address);

      expect(bal1After - bal1Before).to.equal(ENTRY_FEE);
      expect(bal2After - bal2Before).to.equal(ENTRY_FEE);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(2); // Cancelled
    });

    it("should reject cancel by non-creator", async function () {
      await expect(cardDrawGame.connect(player1).cancelGame(gameId))
        .to.be.revertedWith("Only creator can cancel");
    });

    it("should allow cancel of empty game", async function () {
      await expect(cardDrawGame.cancelGame(gameId))
        .to.emit(cardDrawGame, "GameCancelled")
        .withArgs(gameId);

      const game = await cardDrawGame.getGame(gameId);
      expect(game.status).to.equal(2); // Cancelled
    });
  });

  describe("admin", function () {
    it("should allow admin to withdraw accumulated fees", async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      await joinWithCard(player1, 1, 10);
      await joinWithCard(player2, 1, 20);
      await time.increase(DEFAULT_TIMEOUT + 1);
      await cardDrawGame.closeGame(1);

      const fees = await cardDrawGame.accumulatedFees();
      expect(fees).to.be.gt(0);

      const balBefore = await mockToken.balanceOf(owner.address);
      await cardDrawGame.withdrawFees(owner.address);
      const balAfter = await mockToken.balanceOf(owner.address);

      expect(balAfter - balBefore).to.equal(fees);
      expect(await cardDrawGame.accumulatedFees()).to.equal(0);
    });

    it("should reject fee withdrawal by non-admin", async function () {
      await expect(cardDrawGame.connect(player1).withdrawFees(player1.address))
        .to.be.revertedWith("Only admin can withdraw fees");
    });
  });

  describe("getters", function () {
    it("should return all players via getGamePlayers", async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      await joinWithCard(player1, 1, 10);
      await joinWithCard(player2, 1, 20);
      await joinWithCard(player3, 1, 30);

      const players = await cardDrawGame.getGamePlayers(1);
      expect(players.length).to.equal(3);
      expect(players[0].addr).to.equal(player1.address);
      expect(players[0].drawnCard).to.equal(10);
      expect(players[0].hasDrawn).to.be.true;
      expect(players[1].addr).to.equal(player2.address);
      expect(players[2].addr).to.equal(player3.address);
    });
  });

  describe("card scoring", function () {
    it("should rank cards correctly across all suits", async function () {
      // Test: Ace of Spades (card 0) vs 2 of Clubs (card 40)
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      await joinWithCard(player1, 1, 0);  // Ace of Spades (best)
      await joinWithCard(player2, 1, 40); // 2 of Clubs (worst non-ace)

      await time.increase(DEFAULT_TIMEOUT + 1);
      await cardDrawGame.closeGame(1);

      const game = await cardDrawGame.getGame(1);
      expect(game.winner).to.equal(player1.address);
    });

    it("should handle 3-player game with correct prize", async function () {
      await cardDrawGame.createGame(DEFAULT_TIMEOUT);
      await joinWithCard(player1, 1, 5);  // 6 of Spades
      await joinWithCard(player2, 1, 10); // Jack of Spades
      await joinWithCard(player3, 1, 11); // Queen of Spades

      await time.increase(DEFAULT_TIMEOUT + 1);

      const winnerBalBefore = await mockToken.balanceOf(player3.address);
      await cardDrawGame.closeGame(1);
      const winnerBalAfter = await mockToken.balanceOf(player3.address);

      // 3 * 10 TON = 30 TON, 10% fee = 3 TON, prize = 27 TON
      const expectedPrize = ENTRY_FEE * 3n * 90n / 100n;
      expect(winnerBalAfter - winnerBalBefore).to.equal(expectedPrize);
    });
  });
});
