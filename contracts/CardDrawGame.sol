// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./verifiers/IGroth16Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CardDrawGame
 * @dev F9: Multiplayer Card Draw Game (Commit-Reveal scheme).
 *
 *      SECURITY: Two-phase design prevents seed cherry-picking.
 *
 *      Phase 1 – COMMIT (Open):
 *        joinGame(deckCommitment, playerCommitment) — pay entry fee + commit to deck.
 *        No ZK proof required. drawIndex is NOT yet determined.
 *        Player doesn't know their card result at this point.
 *
 *      Phase 1.5 – PENDING REVEAL (PendingReveal):
 *        startReveal() — anyone calls after commit phase ends.
 *          Records revealBlock = block.number + 2. Status → PendingReveal.
 *          The seed block does not exist yet, so nobody can predict the seed.
 *
 *      Phase 2 – REVEAL (Revealing):
 *        finalizeReveal() — anyone calls once block.number > revealBlock.
 *          revealSeed = blockhash(revealBlock)  ← block that didn't exist at startReveal time
 *          Each player's drawIndex = keccak256(revealSeed, playerAddr, gameId) % 52
 *        revealCard(ZK proof) — player proves deckCards[drawIndex] = drawnCard.
 *          Only now is the card deterministic; seed can't be pre-simulated.
 *
 *      CLOSE: Winner = highest card among revealed players.
 *             Unrevealed players forfeit their entry fee.
 *
 *      Circuit public inputs (unchanged): [deckCommitment, drawCommitment, drawIndex, gameId, playerCommitment]
 */
contract CardDrawGame {
    ICardDrawVerifier public drawVerifier;
    IERC20 public paymentToken;
    address public admin;

    uint256 public constant MAX_PLAYERS = 5;
    uint256 public constant MIN_PLAYERS = 2;
    uint256 public constant FEE_PERCENT = 10;
    uint256 public constant REVEAL_TIMEOUT = 120; // 2 minutes to reveal after startReveal

    uint256 public entryFee;
    uint256 public defaultCommitTimeout; // seconds after last join before startReveal is allowed
    uint256 public nextGameId = 1;

    enum GameStatus { Open, PendingReveal, Revealing, Finished, Cancelled }

    struct Game {
        address creator;
        GameStatus status;
        uint256 commitTimeout;     // seconds after last join before startReveal is allowed
        uint256 lastJoinTime;      // updated on every join
        uint256 playerCount;
        uint256 revealedCount;
        uint256 prizePool;
        uint256 revealBlock;           // target block for seed (set by startReveal, doesn't exist yet)
        uint256 prevRandaoSnapshot;    // block.prevrandao captured at startReveal time
        uint256 revealSeed;            // set by finalizeReveal(): keccak256(blockhash(revealBlock), prevRandaoSnapshot)
        uint256 revealDeadline;        // set by finalizeReveal(): finalizeTime + REVEAL_TIMEOUT
        address winner;
        uint256 highestCardValue;
        uint256 createdAt;
    }

    struct Player {
        address addr;
        bytes32 deckCommitment;
        bytes32 playerCommitment;
        uint256 drawnCard;         // 0-51, only valid after reveal
        bool hasCommitted;
        bool hasRevealed;
    }

    mapping(uint256 => Game) public games;
    mapping(uint256 => Player[]) internal _players;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint256 => mapping(address => uint256)) internal _playerIndex;
    uint256 public accumulatedFees;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 commitTimeout);
    event PlayerCommitted(uint256 indexed gameId, address indexed player, uint256 playerCount);
    event RevealPending(uint256 indexed gameId, uint256 revealBlock);
    event RevealStarted(uint256 indexed gameId, uint256 revealSeed, uint256 revealDeadline);
    event PlayerRevealed(uint256 indexed gameId, address indexed player, uint256 drawnCard, uint256 drawIndex);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 highestCard);
    event GameCancelled(uint256 indexed gameId);

    constructor(
        address _drawVerifier,
        address _paymentToken,
        uint256 _entryFee,
        uint256 _defaultCommitTimeout
    ) {
        drawVerifier = ICardDrawVerifier(_drawVerifier);
        paymentToken = IERC20(_paymentToken);
        admin = msg.sender;
        entryFee = _entryFee;
        defaultCommitTimeout = _defaultCommitTimeout;
    }

    // ─── Phase 0: Create ───────────────────────────────────────────────────────

    /**
     * @dev Create a new game room.
     * @param commitTimeout Seconds after the last player joins before startReveal is callable.
     */
    function createGame(uint256 commitTimeout) external returns (uint256 gameId) {
        require(commitTimeout >= 30, "Commit timeout must be >= 30 seconds");

        gameId = nextGameId++;
        games[gameId] = Game({
            creator: msg.sender,
            status: GameStatus.Open,
            commitTimeout: commitTimeout,
            lastJoinTime: 0,
            playerCount: 0,
            revealedCount: 0,
            prizePool: 0,
            revealBlock: 0,
            prevRandaoSnapshot: 0,
            revealSeed: 0,
            revealDeadline: 0,
            winner: address(0),
            highestCardValue: 0,
            createdAt: block.timestamp
        });

        emit GameCreated(gameId, msg.sender, commitTimeout);
    }

    // ─── Phase 1: Commit ───────────────────────────────────────────────────────

    /**
     * @dev Commit phase: pay entry fee + commit to deck. NO ZK proof required.
     *      Player does not know their final card at this point
     *      (drawIndex is determined only after startReveal, from on-chain randomness).
     *
     * @param deckCommitment  Poseidon commitment to the player's shuffled deck
     * @param playerCommitment Poseidon(playerPkX, playerPkY, gameId)
     */
    function joinGame(
        uint256 gameId,
        bytes32 deckCommitment,
        bytes32 playerCommitment
    ) external {
        Game storage game = games[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(game.status == GameStatus.Open, "Game is not in commit phase");
        require(!hasJoined[gameId][msg.sender], "Already joined");
        require(game.playerCount < MAX_PLAYERS, "Game is full");

        // Once MIN_PLAYERS joined, check the commit window
        if (game.playerCount >= MIN_PLAYERS && game.lastJoinTime > 0) {
            require(
                block.timestamp <= game.lastJoinTime + game.commitTimeout,
                "Commit phase has ended"
            );
        }

        // Transfer entry fee
        require(
            paymentToken.transferFrom(msg.sender, address(this), entryFee),
            "Entry fee transfer failed"
        );

        // Record commitment (no ZK proof, drawnCard unknown)
        uint256 playerIdx = _players[gameId].length;
        _players[gameId].push(Player({
            addr: msg.sender,
            deckCommitment: deckCommitment,
            playerCommitment: playerCommitment,
            drawnCard: 0,
            hasCommitted: true,
            hasRevealed: false
        }));
        _playerIndex[gameId][msg.sender] = playerIdx;
        hasJoined[gameId][msg.sender] = true;
        game.playerCount++;
        game.prizePool += entryFee;
        game.lastJoinTime = block.timestamp;

        emit PlayerCommitted(gameId, msg.sender, game.playerCount);
    }

    // ─── Phase 1 → 2: Transition ───────────────────────────────────────────────

    /**
     * @dev Phase 1 → 1.5: Record the target block for seed derivation.
     *      Anyone can call once the commit phase has ended.
     *
     *      Sets revealBlock = block.number + 2.
     *      That block does not exist yet, so no one can know blockhash(revealBlock)
     *      at call time — preventing validator seed cherry-picking.
     *
     *      Also snapshots block.prevrandao at this moment.
     *      Final seed = keccak256(blockhash(revealBlock), prevRandaoSnapshot).
     *      Manipulating the seed requires colluding BOTH:
     *        - the startReveal caller (controls prevRandaoSnapshot timing), AND
     *        - the revealBlock producer (controls blockhash).
     */
    function startReveal(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Game is not in commit phase");
        require(game.playerCount >= MIN_PLAYERS, "Not enough players");
        require(
            game.playerCount >= MAX_PLAYERS ||
            block.timestamp > game.lastJoinTime + game.commitTimeout,
            "Commit phase has not ended yet"
        );

        game.revealBlock = block.number + 2;
        game.prevRandaoSnapshot = block.prevrandao;
        game.status = GameStatus.PendingReveal;

        emit RevealPending(gameId, game.revealBlock);
    }

    /**
     * @dev Phase 1.5 → 2: Derive revealSeed from the now-known target block hash
     *      combined with the prevrandao snapshot captured at startReveal.
     *      Anyone can call once block.number > revealBlock.
     *
     *      revealSeed = keccak256(blockhash(revealBlock), prevRandaoSnapshot)
     *      drawIndex  = keccak256(revealSeed, playerAddr, gameId) % 52
     *
     *      Note: blockhash() returns 0 for blocks older than 256. Call within ~51 min.
     */
    function finalizeReveal(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.PendingReveal, "Not in pending reveal phase");
        require(block.number > game.revealBlock, "Target block not yet mined");

        bytes32 blockHash = blockhash(game.revealBlock);
        require(blockHash != bytes32(0), "Block hash unavailable (>256 blocks passed)");

        game.revealSeed = uint256(keccak256(abi.encodePacked(blockHash, game.prevRandaoSnapshot)));
        game.revealDeadline = block.timestamp + REVEAL_TIMEOUT;
        game.status = GameStatus.Revealing;

        emit RevealStarted(gameId, game.revealSeed, game.revealDeadline);
    }

    // ─── Phase 2: Reveal ───────────────────────────────────────────────────────

    /**
     * @dev Reveal phase: submit ZK proof.
     *      drawIndex is computed from revealSeed set by finalizeReveal() and cannot be pre-simulated.
     *      The ZK proof proves: deckCards[drawIndex] = drawnCard given deckCommitment.
     */
    function revealCard(
        uint256 gameId,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 drawCommitment,
        uint256 drawnCard
    ) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Revealing, "Game is not in reveal phase");
        require(hasJoined[gameId][msg.sender], "Not a player in this game");
        require(block.timestamp <= game.revealDeadline, "Reveal deadline has passed");

        uint256 playerIdx = _playerIndex[gameId][msg.sender];
        Player storage player = _players[gameId][playerIdx];
        require(!player.hasRevealed, "Already revealed");
        require(drawnCard < 52, "Invalid card index");

        // drawIndex is determined by on-chain randomness — player cannot choose it
        uint256 drawIndex = getPlayerDrawIndex(gameId, msg.sender);

        // Verify ZK proof with the externally-determined drawIndex
        uint256[5] memory publicInputs = [
            uint256(player.deckCommitment),
            uint256(drawCommitment),
            drawIndex,
            gameId,
            uint256(player.playerCommitment)
        ];
        require(
            drawVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid card draw proof"
        );

        player.drawnCard = drawnCard;
        player.hasRevealed = true;
        game.revealedCount++;

        emit PlayerRevealed(gameId, msg.sender, drawnCard, drawIndex);
    }

    // ─── Phase 2 → 3: Close ────────────────────────────────────────────────────

    /**
     * @dev Close the game after reveal phase. Winner is highest card among revealed players.
     *      Players who did not reveal forfeit their entry fee (goes to accumulatedFees).
     */
    function closeGame(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Revealing, "Game is not in reveal phase");
        require(
            game.revealedCount == game.playerCount ||
            block.timestamp > game.revealDeadline,
            "Reveal phase has not ended yet"
        );

        Player[] storage players = _players[gameId];

        // If nobody revealed, cancel and refund all
        if (game.revealedCount == 0) {
            for (uint256 i = 0; i < players.length; i++) {
                paymentToken.transfer(players[i].addr, entryFee);
            }
            game.status = GameStatus.Cancelled;
            emit GameCancelled(gameId);
            return;
        }

        // Find winner among revealed players only
        uint256 highestScore = 0;
        address winner = address(0);
        uint256 highestCard = 0;

        for (uint256 i = 0; i < players.length; i++) {
            if (!players[i].hasRevealed) continue;
            uint256 score = _cardScore(players[i].drawnCard);
            if (score > highestScore) {
                highestScore = score;
                winner = players[i].addr;
                highestCard = players[i].drawnCard;
            }
        }

        // Prize pool = revealed players only; forfeited fees go to contract
        uint256 revealedPool = game.revealedCount * entryFee;
        uint256 forfeitedFees = (game.playerCount - game.revealedCount) * entryFee;
        uint256 fee = revealedPool * FEE_PERCENT / 100;
        uint256 prize = revealedPool - fee;

        accumulatedFees += fee + forfeitedFees;

        require(paymentToken.transfer(winner, prize), "Prize transfer failed");

        game.status = GameStatus.Finished;
        game.winner = winner;
        game.highestCardValue = highestCard;

        emit GameFinished(gameId, winner, prize, highestCard);
    }

    // ─── Utility ───────────────────────────────────────────────────────────────

    /**
     * @dev Cancel the game (creator only, commit phase only). Refunds all committed players.
     */
    function cancelGame(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Game is not in commit phase");
        require(msg.sender == game.creator, "Only creator can cancel");

        Player[] storage players = _players[gameId];
        for (uint256 i = 0; i < players.length; i++) {
            paymentToken.transfer(players[i].addr, entryFee);
        }

        game.status = GameStatus.Cancelled;
        emit GameCancelled(gameId);
    }

    /**
     * @dev Get the deterministic drawIndex for a player (only valid after startReveal).
     *      drawIndex = keccak256(revealSeed, playerAddr, gameId) % 52
     */
    function getPlayerDrawIndex(uint256 gameId, address player) public view returns (uint256) {
        Game storage game = games[gameId];
        require(game.revealSeed != 0, "Reveal has not started");
        return uint256(keccak256(abi.encodePacked(game.revealSeed, player, gameId))) % 52;
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function getGamePlayers(uint256 gameId) external view returns (Player[] memory) {
        return _players[gameId];
    }

    function withdrawFees(address to) external {
        require(msg.sender == admin, "Only admin can withdraw fees");
        require(accumulatedFees > 0, "No fees to withdraw");
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        require(paymentToken.transfer(to, amount), "Fee transfer failed");
    }

    /**
     * @dev Card score: rank = card % 13 (0=A, 1=2, ..., 12=K)
     *      Ace=14, K=13, ..., 2=2. Suit tiebreaker: Spades > Hearts > Diamonds > Clubs.
     *      Score = rankValue * 4 + (3 - suitIndex)
     */
    function _cardScore(uint256 card) internal pure returns (uint256) {
        uint256 rank = card % 13;
        uint256 suitIndex = card / 13;
        uint256 rankValue = rank == 0 ? 14 : rank + 1;
        return rankValue * 4 + (3 - suitIndex);
    }
}
