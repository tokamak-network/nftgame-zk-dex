// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./verifiers/IGroth16Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CardDrawGame
 * @dev F9: Multiplayer Card Draw Game.
 *      Players join a game room by paying an entry fee and submitting a ZK-proven card draw.
 *      The highest card wins the prize pool (minus fees).
 *
 *      joinGame is atomic: payment + deck registration + ZK proof + card submission
 *      in a single transaction to prevent information leakage.
 *
 *      Card ranking: rank = cardIndex % 13 (0=A,1=2,...,12=K)
 *      Ace=14, K=13, Q=12, ..., 2=2 (Ace highest)
 *      Tiebreaker: Spades > Hearts > Diamonds > Clubs
 *      Score = rankValue * 4 + (3 - suitIndex)
 */
contract CardDrawGame {
    ICardDrawVerifier public drawVerifier;
    IERC20 public paymentToken;
    address public admin;

    uint256 public constant MAX_PLAYERS = 5;
    uint256 public constant MIN_PLAYERS = 2;
    uint256 public constant FEE_PERCENT = 10;
    uint256 public entryFee;
    uint256 public defaultTimeout;
    uint256 public nextGameId = 1;

    enum GameStatus { Open, Finished, Cancelled }

    struct Game {
        address creator;
        GameStatus status;
        uint256 timeout;
        uint256 lastJoinTime;
        uint256 playerCount;
        uint256 prizePool;
        address winner;
        uint256 highestCardValue;
        uint256 createdAt;
    }

    struct Player {
        address addr;
        uint256 drawnCard;     // 0-51
        bool hasDrawn;
    }

    mapping(uint256 => Game) public games;
    mapping(uint256 => Player[]) internal _players;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    uint256 public accumulatedFees;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 timeout);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint256 playerCount);
    event PlayerDrew(uint256 indexed gameId, address indexed player, uint256 drawnCard);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 prize, uint256 highestCard);
    event GameCancelled(uint256 indexed gameId);

    constructor(
        address _drawVerifier,
        address _paymentToken,
        uint256 _entryFee,
        uint256 _defaultTimeout
    ) {
        drawVerifier = ICardDrawVerifier(_drawVerifier);
        paymentToken = IERC20(_paymentToken);
        admin = msg.sender;
        entryFee = _entryFee;
        defaultTimeout = _defaultTimeout;
    }

    /**
     * @dev Create a new game room.
     * @param timeout Seconds to wait after last join before game can be closed.
     */
    function createGame(uint256 timeout) external returns (uint256 gameId) {
        require(timeout >= 30, "Timeout must be >= 30 seconds");

        gameId = nextGameId++;
        games[gameId] = Game({
            creator: msg.sender,
            status: GameStatus.Open,
            timeout: timeout,
            lastJoinTime: 0,
            playerCount: 0,
            prizePool: 0,
            winner: address(0),
            highestCardValue: 0,
            createdAt: block.timestamp
        });

        emit GameCreated(gameId, msg.sender, timeout);
    }

    /**
     * @dev Join a game: pay entry fee + submit ZK-proven card draw atomically.
     *      Prevents information leakage by combining payment and card submission.
     */
    function joinGame(
        uint256 gameId,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        bytes32 deckCommitment,
        bytes32 drawCommitment,
        uint256 drawIndex,
        bytes32 playerCommitment,
        uint256 drawnCard
    ) external {
        Game storage game = games[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(game.status == GameStatus.Open, "Game is not open");
        require(!hasJoined[gameId][msg.sender], "Already joined this game");
        require(game.playerCount < MAX_PLAYERS, "Game is full");

        // If MIN_PLAYERS reached, check timeout
        if (game.playerCount >= MIN_PLAYERS) {
            require(
                block.timestamp <= game.lastJoinTime + game.timeout,
                "Join window has expired"
            );
        }

        // Transfer entry fee
        require(
            paymentToken.transferFrom(msg.sender, address(this), entryFee),
            "Entry fee transfer failed"
        );

        // Verify ZK proof
        uint256[5] memory publicInputs = [
            uint256(deckCommitment),
            uint256(drawCommitment),
            drawIndex,
            gameId,
            uint256(playerCommitment)
        ];
        require(
            drawVerifier.verifyProof(a, b, c, publicInputs),
            "Invalid card draw proof"
        );

        // Validate drawn card
        require(drawnCard < 52, "Invalid card index");

        // Record player
        _players[gameId].push(Player({
            addr: msg.sender,
            drawnCard: drawnCard,
            hasDrawn: true
        }));
        hasJoined[gameId][msg.sender] = true;
        game.playerCount++;
        game.prizePool += entryFee;
        game.lastJoinTime = block.timestamp;

        emit PlayerJoined(gameId, msg.sender, game.playerCount);
        emit PlayerDrew(gameId, msg.sender, drawnCard);
    }

    /**
     * @dev Close the game and distribute prizes to the winner.
     *      Can be called by anyone when conditions are met.
     */
    function closeGame(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Game is not open");
        require(game.playerCount >= MIN_PLAYERS, "Not enough players");
        require(
            game.playerCount >= MAX_PLAYERS ||
            block.timestamp > game.lastJoinTime + game.timeout,
            "Game cannot be closed yet"
        );

        // Find winner (highest card score)
        uint256 highestScore = 0;
        address winner = address(0);
        uint256 highestCard = 0;
        Player[] storage players = _players[gameId];

        for (uint256 i = 0; i < players.length; i++) {
            uint256 score = _cardScore(players[i].drawnCard);
            if (score > highestScore) {
                highestScore = score;
                winner = players[i].addr;
                highestCard = players[i].drawnCard;
            }
        }

        // Calculate fees and prize
        uint256 fee = game.prizePool * FEE_PERCENT / 100;
        uint256 prize = game.prizePool - fee;
        accumulatedFees += fee;

        // Transfer prize to winner
        require(paymentToken.transfer(winner, prize), "Prize transfer failed");

        // Update game state
        game.status = GameStatus.Finished;
        game.winner = winner;
        game.highestCardValue = highestCard;

        emit GameFinished(gameId, winner, prize, highestCard);
    }

    /**
     * @dev Cancel the game and refund all participants.
     *      Only the creator can cancel.
     */
    function cancelGame(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Game is not open");
        require(msg.sender == game.creator, "Only creator can cancel");

        // Refund all players
        Player[] storage players = _players[gameId];
        for (uint256 i = 0; i < players.length; i++) {
            paymentToken.transfer(players[i].addr, entryFee);
        }

        game.status = GameStatus.Cancelled;
        emit GameCancelled(gameId);
    }

    /**
     * @dev Get game details.
     */
    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    /**
     * @dev Get all players in a game.
     */
    function getGamePlayers(uint256 gameId) external view returns (Player[] memory) {
        return _players[gameId];
    }

    /**
     * @dev Withdraw accumulated fees. Admin only.
     */
    function withdrawFees(address to) external {
        require(msg.sender == admin, "Only admin can withdraw fees");
        require(accumulatedFees > 0, "No fees to withdraw");

        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        require(paymentToken.transfer(to, amount), "Fee transfer failed");
    }

    /**
     * @dev Calculate card score for ranking.
     *      rank = card % 13 (0=A, 1=2, ..., 12=K)
     *      rankValue: Ace=14, 2=2, ..., K=13
     *      suitIndex = card / 13 (0=Spades, 1=Hearts, 2=Diamonds, 3=Clubs)
     *      Tiebreaker: Spades > Hearts > Diamonds > Clubs
     *      Score = rankValue * 4 + (3 - suitIndex)
     */
    function _cardScore(uint256 card) internal pure returns (uint256) {
        uint256 rank = card % 13;
        uint256 suitIndex = card / 13;
        uint256 rankValue = rank == 0 ? 14 : rank + 1;
        return rankValue * 4 + (3 - suitIndex);
    }
}
