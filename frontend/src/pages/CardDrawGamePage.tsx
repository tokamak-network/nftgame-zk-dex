import { useState, useEffect, useCallback, useRef } from "react";
import { ProofStatus } from "../components/ProofStatus";
import { TxStatus } from "../components/TxStatus";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { useProofGeneration } from "../hooks/useProofGeneration";
import {
  setupF8Game,
  prepareF8Draw,
  generateF8Proof,
  getCardName,
  getCardColor,
} from "../lib/cardUtils";
import { toBytes32 } from "../lib/crypto";
import { ethers } from "ethers";

type GameStatus = "Open" | "Finished" | "Cancelled";
const STATUS_MAP: GameStatus[] = ["Open", "Finished", "Cancelled"];

type GameInfo = {
  id: number;
  creator: string;
  status: GameStatus;
  timeout: number;
  lastJoinTime: number;
  playerCount: number;
  prizePool: bigint;
  winner: string;
  highestCardValue: number;
  createdAt: number;
};

type PlayerInfo = {
  addr: string;
  drawnCard: number;
  hasDrawn: boolean;
};

type View = "list" | "room";

const ENTRY_FEE = ethers.parseEther("10");
const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;

function parseGame(raw: unknown[], id: number): GameInfo {
  const r = raw as [string, bigint, bigint, bigint, bigint, bigint, string, bigint, bigint];
  return {
    id,
    creator: r[0],
    status: STATUS_MAP[Number(r[1])],
    timeout: Number(r[2]),
    lastJoinTime: Number(r[3]),
    playerCount: Number(r[4]),
    prizePool: r[5],
    winner: r[6],
    highestCardValue: Number(r[7]),
    createdAt: Number(r[8]),
  };
}

function parsePlayer(raw: unknown[]): PlayerInfo {
  const r = raw as [string, bigint, boolean];
  return { addr: r[0], drawnCard: Number(r[1]), hasDrawn: r[2] };
}

function cardScore(card: number): number {
  const rank = card % 13;
  const suitIndex = Math.floor(card / 13);
  const rankValue = rank === 0 ? 14 : rank + 1;
  return rankValue * 4 + (3 - suitIndex);
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function CardDrawGamePage() {
  const { signer, address, isConnected } = useWallet();
  const gameContract = useContract("CardDrawGame", signer);
  const tokenContract = useContract("MockERC20", signer);
  const proof = useProofGeneration();

  const [view, setView] = useState<View>("list");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Create game state
  const [timeoutInput, setTimeoutInput] = useState("60");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join state
  const [joinStep, setJoinStep] = useState<"idle" | "proving" | "approving" | "joining" | "done" | "error">("idle");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinTxHash, setJoinTxHash] = useState<string | null>(null);
  const [myCard, setMyCard] = useState<number | null>(null);

  // Close/Cancel state
  const [closePending, setClosePending] = useState(false);
  const [closeTxHash, setCloseTxHash] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1-second timer for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all games
  const fetchGames = useCallback(async () => {
    if (!gameContract) return;
    try {
      const nextId = Number(await gameContract.nextGameId());
      const fetched: GameInfo[] = [];
      for (let i = 1; i < nextId; i++) {
        const raw = await gameContract.getGame(i);
        fetched.push(parseGame(raw, i));
      }
      setGames(fetched);
    } catch (err) {
      console.error("Failed to fetch games:", err);
    }
  }, [gameContract]);

  // Fetch selected game details
  const fetchGameDetail = useCallback(async () => {
    if (!gameContract || !selectedGameId) return;
    try {
      const raw = await gameContract.getGame(selectedGameId);
      const game = parseGame(raw, selectedGameId);
      setSelectedGame(game);

      const rawPlayers = await gameContract.getGamePlayers(selectedGameId);
      setPlayers(rawPlayers.map((p: unknown[]) => parsePlayer(p)));
    } catch (err) {
      console.error("Failed to fetch game detail:", err);
    }
  }, [gameContract, selectedGameId]);

  // Polling: game list (5s) or game detail (3s)
  useEffect(() => {
    if (!gameContract) return;

    const poll = view === "list" ? fetchGames : fetchGameDetail;
    const interval = view === "list" ? 5000 : 3000;

    poll();
    pollRef.current = setInterval(poll, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameContract, view, fetchGames, fetchGameDetail]);

  // Create game
  async function handleCreateGame() {
    if (!gameContract) return;
    setCreatePending(true);
    setCreateError(null);
    try {
      const tx = await gameContract.createGame(Number(timeoutInput));
      await tx.wait();
      await fetchGames();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreatePending(false);
    }
  }

  // Join game (atomic: proof → approve → joinGame)
  async function handleJoinGame(gameId: number) {
    if (!gameContract || !tokenContract || !address) return;
    setJoinStep("proving");
    setJoinError(null);
    setJoinTxHash(null);
    setMyCard(null);
    proof.reset();

    try {
      // Step 1: Setup & prepare draw
      const game = await setupF8Game(BigInt(gameId));
      const drawData = await prepareF8Draw(game, 0);

      // Step 2: Generate ZK proof
      const proofResult = await proof.generate(generateF8Proof, drawData.circuitInputs);
      if (!proofResult) {
        setJoinStep("error");
        setJoinError("Proof generation failed");
        return;
      }

      // Step 3: Approve ERC20
      setJoinStep("approving");
      const contractAddr = await gameContract.getAddress();
      const approveTx = await tokenContract.approve(contractAddr, ENTRY_FEE);
      await approveTx.wait();

      // Step 4: Join game
      setJoinStep("joining");
      const { proof: p } = proofResult;
      const tx = await gameContract.joinGame(
        gameId,
        p.a, p.b, p.c,
        toBytes32(game.deckCommitment),
        toBytes32(drawData.drawCommitment),
        0, // drawIndex
        toBytes32(game.playerCommitment),
        drawData.drawnCard,
      );
      setJoinTxHash(tx.hash);
      await tx.wait();

      setMyCard(drawData.drawnCard);
      setJoinStep("done");

      // Navigate to room view
      setSelectedGameId(gameId);
      setView("room");
    } catch (err) {
      setJoinStep("error");
      setJoinError(err instanceof Error ? err.message : "Join failed");
    }
  }

  // Close game
  async function handleCloseGame() {
    if (!gameContract || !selectedGameId) return;
    setClosePending(true);
    setCloseError(null);
    setCloseTxHash(null);
    try {
      const tx = await gameContract.closeGame(selectedGameId);
      setCloseTxHash(tx.hash);
      await tx.wait();
      await fetchGameDetail();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setClosePending(false);
    }
  }

  // Cancel game
  async function handleCancelGame() {
    if (!gameContract || !selectedGameId) return;
    setClosePending(true);
    setCloseError(null);
    setCloseTxHash(null);
    try {
      const tx = await gameContract.cancelGame(selectedGameId);
      setCloseTxHash(tx.hash);
      await tx.wait();
      await fetchGameDetail();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setClosePending(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-yellow">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to play.</p>
      </div>
    );
  }

  // Game List View
  if (view === "list") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 stagger-in">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-yellow rounded neon-text-yellow">
              MULTIPLAYER
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-wider neon-text-yellow mb-1">
            F9: Card Draw Game
          </h1>
          <p className="text-sm font-body text-gray-500">
            Join a game room, draw a card with ZK proof, and compete for the prize pool.
            Entry fee: 10 TON. Highest card wins.
          </p>
        </div>

        {/* Create Game */}
        <div className="glass-panel border neon-border-yellow p-5">
          <h3 className="font-display font-bold text-sm tracking-wide neon-text-yellow mb-3">
            CREATE NEW GAME
          </h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">
                Timeout (seconds)
              </label>
              <input
                type="number"
                min="30"
                value={timeoutInput}
                onChange={(e) => setTimeoutInput(e.target.value)}
                className="neon-input neon-input-yellow w-full"
              />
            </div>
            <button
              onClick={handleCreateGame}
              disabled={createPending}
              className="neon-btn neon-btn-yellow"
            >
              {createPending ? "Creating..." : "Create Game"}
            </button>
          </div>
          {createError && (
            <p className="text-xs text-red-400 mt-2">{createError}</p>
          )}
        </div>

        {/* Game List */}
        <div className="space-y-3">
          {games.length === 0 && (
            <div className="glass-panel border border-border-dim p-6 text-center">
              <p className="text-sm text-gray-500">No games yet. Create one!</p>
            </div>
          )}
          {games.map((g) => {
            const isOpen = g.status === "Open";
            const canJoin = isOpen && g.playerCount < MAX_PLAYERS;
            const timeRemaining = g.playerCount >= MIN_PLAYERS && g.lastJoinTime > 0
              ? g.lastJoinTime + g.timeout - now
              : null;
            const isExpired = timeRemaining !== null && timeRemaining <= 0;
            const isReady = isOpen && g.playerCount >= MIN_PLAYERS && (isExpired || g.playerCount >= MAX_PLAYERS);

            return (
              <div
                key={g.id}
                className={`glass-panel border p-4 ${
                  isOpen ? "neon-border-yellow" : g.status === "Finished" ? "border-neon-green/30" : "border-border-dim"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-display text-sm font-bold neon-text-yellow">
                      #{g.id}
                    </span>
                    <span className="text-xs font-body text-gray-400">
                      {g.playerCount}/{MAX_PLAYERS} players
                    </span>
                    <span className="text-xs font-mono neon-text-cyan">
                      {ethers.formatEther(g.prizePool)} TON
                    </span>
                    {isOpen && g.playerCount < MIN_PLAYERS && (
                      <span className="text-xs font-body text-gray-500">Waiting...</span>
                    )}
                    {isOpen && timeRemaining !== null && timeRemaining > 0 && (
                      <span className="text-xs font-mono neon-text-yellow">
                        {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
                      </span>
                    )}
                    {isReady && (
                      <span className="text-[10px] font-display tracking-wider px-2 py-0.5 bg-neon-green/20 neon-text-green rounded">
                        READY TO CLOSE
                      </span>
                    )}
                    {g.status === "Finished" && (
                      <span className="text-xs font-body text-gray-400">
                        Winner: {getCardName(g.highestCardValue)}
                      </span>
                    )}
                    {g.status === "Cancelled" && (
                      <span className="text-xs font-body text-gray-500">Cancelled</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {canJoin && !isExpired && (
                      <button
                        onClick={() => handleJoinGame(g.id)}
                        disabled={joinStep !== "idle" && joinStep !== "done" && joinStep !== "error"}
                        className="neon-btn neon-btn-yellow text-xs py-1.5 px-3"
                      >
                        JOIN
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedGameId(g.id); setView("room"); }}
                      className="neon-btn neon-btn-cyan text-xs py-1.5 px-3"
                    >
                      VIEW
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Join Progress */}
        {joinStep !== "idle" && (
          <div className="glass-panel border neon-border-yellow p-5 space-y-3">
            <h3 className="font-display font-bold text-sm tracking-wide neon-text-yellow">
              JOINING GAME...
            </h3>
            {joinStep === "proving" && (
              <ProofStatus
                isGenerating={proof.isGenerating}
                elapsed={proof.elapsed}
                error={proof.error}
                duration={proof.result?.duration}
              />
            )}
            {joinStep === "approving" && (
              <div className="glass-panel border border-neon-cyan/30 p-3 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-display tracking-wider neon-text-cyan">
                  Approving ERC20 transfer...
                </span>
              </div>
            )}
            {joinStep === "joining" && (
              <TxStatus txHash={joinTxHash} isPending={true} isConfirmed={false} error={null} />
            )}
            {joinStep === "done" && myCard !== null && (
              <div className="glass-panel border border-neon-green/30 p-3 text-sm">
                <span className="font-display text-xs tracking-wider neon-text-green mr-2">JOINED</span>
                <span className="font-body text-gray-300">
                  Your card: <span className={`font-bold ${getCardColor(myCard)}`}>{getCardName(myCard)}</span>
                </span>
              </div>
            )}
            {joinStep === "error" && (
              <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400">
                <span className="font-display text-xs tracking-wider text-red-500 mr-2">ERROR</span>
                {joinError}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Game Room View
  const g = selectedGame;
  const isCreator = g && address && g.creator.toLowerCase() === address.toLowerCase();
  const amIPlayer = players.some(
    (p) => address && p.addr.toLowerCase() === address.toLowerCase()
  );
  const isFinished = g?.status === "Finished";
  const isCancelled = g?.status === "Cancelled";
  const isOpen = g?.status === "Open";

  const timeRemaining = g && g.playerCount >= MIN_PLAYERS && g.lastJoinTime > 0
    ? g.lastJoinTime + g.timeout - now
    : null;
  const isExpired = timeRemaining !== null && timeRemaining <= 0;
  const canClose = isOpen && g && g.playerCount >= MIN_PLAYERS && (isExpired || g.playerCount >= MAX_PLAYERS);
  const canCancel = isOpen && isCreator;

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={() => { setView("list"); setSelectedGameId(null); setSelectedGame(null); setPlayers([]); setCloseError(null); setCloseTxHash(null); }}
          className="text-gray-500 hover:neon-text-yellow transition-colors font-display text-sm"
        >
          &larr; Back
        </button>
        <h1 className="font-display text-xl font-bold tracking-wider neon-text-yellow">
          Game #{selectedGameId}
        </h1>
        {g && (
          <>
            <span className={`text-[10px] font-display tracking-wider px-2 py-0.5 rounded ${
              isOpen ? "bg-neon-yellow/20 neon-text-yellow" :
              isFinished ? "bg-neon-green/20 neon-text-green" :
              "bg-gray-700 text-gray-400"
            }`}>
              {g.status.toUpperCase()}
            </span>
            {isOpen && timeRemaining !== null && timeRemaining > 0 && (
              <span className="text-sm font-mono neon-text-yellow">
                {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
              </span>
            )}
            {isOpen && isExpired && g.playerCount >= MIN_PLAYERS && (
              <span className="text-[10px] font-display tracking-wider px-2 py-0.5 bg-neon-green/20 neon-text-green rounded">
                READY TO CLOSE
              </span>
            )}
          </>
        )}
      </div>

      {!g ? (
        <div className="glass-panel border border-border-dim p-6 text-center">
          <p className="text-sm text-gray-500">Loading game...</p>
        </div>
      ) : (
        <>
          {/* Game Info */}
          <div className="glass-panel border neon-border-yellow p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">PRIZE POOL</p>
                <p className="font-mono text-lg neon-text-cyan">{ethers.formatEther(g.prizePool)} TON</p>
              </div>
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">PLAYERS</p>
                <p className="font-mono text-lg neon-text-yellow">{g.playerCount}/{MAX_PLAYERS}</p>
              </div>
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">ENTRY FEE</p>
                <p className="font-mono text-lg text-gray-300">10 TON</p>
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="glass-panel border border-border-dim p-5">
            <h3 className="font-display font-bold text-sm tracking-wide text-gray-400 mb-3">
              PLAYERS ({g.playerCount}/{MAX_PLAYERS})
            </h3>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500">No players yet.</p>
            ) : (
              <div className="space-y-2">
                {players.map((p, i) => {
                  const isMe = address && p.addr.toLowerCase() === address.toLowerCase();
                  const showCard = isFinished || isCancelled;

                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-3 rounded ${
                        isMe ? "bg-neon-yellow/10 border border-neon-yellow/30" : "bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-gray-400">
                          {shortAddr(p.addr)}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 bg-neon-yellow/20 neon-text-yellow rounded">
                            YOU
                          </span>
                        )}
                        {isFinished && g.winner.toLowerCase() === p.addr.toLowerCase() && (
                          <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 bg-neon-green/20 neon-text-green rounded">
                            WINNER
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {showCard ? (
                          <span className={`font-display font-bold ${getCardColor(p.drawnCard)}`}>
                            {getCardName(p.drawnCard)}
                          </span>
                        ) : isMe && myCard !== null ? (
                          <span className={`font-display font-bold ${getCardColor(myCard)}`}>
                            {getCardName(myCard)}
                          </span>
                        ) : (
                          <span className="text-gray-600 font-mono text-sm">?</span>
                        )}
                        {showCard && (
                          <span className="text-[10px] font-mono text-gray-500">
                            ({cardScore(p.drawnCard)}pts)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Winner Banner */}
          {isFinished && (
            <div className="glass-panel border neon-border-green p-5 text-center">
              <p className="text-[10px] font-display tracking-[0.2em] text-gray-500 mb-1">WINNER</p>
              <p className="font-display text-lg font-bold neon-text-green">
                {shortAddr(g.winner)}
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className={`font-display text-2xl font-bold ${getCardColor(g.highestCardValue)}`}>
                  {getCardName(g.highestCardValue)}
                </span>
                <span className="text-xs font-mono text-gray-500">
                  ({cardScore(g.highestCardValue)}pts)
                </span>
              </div>
              <p className="text-sm font-mono text-gray-400 mt-2">
                Prize: {ethers.formatEther(g.prizePool * 90n / 100n)} TON
              </p>
            </div>
          )}

          {/* All Cards (after game ends) */}
          {isFinished && players.length > 0 && (
            <div className="glass-panel border border-border-dim p-5">
              <h3 className="font-display font-bold text-sm tracking-wide text-gray-400 mb-3">
                ALL CARDS
              </h3>
              <div className="flex justify-center gap-4 py-2">
                {[...players]
                  .sort((a, b) => cardScore(b.drawnCard) - cardScore(a.drawnCard))
                  .map((p, i) => {
                    const isWinner = g.winner.toLowerCase() === p.addr.toLowerCase();
                    const isRed = Math.floor(p.drawnCard / 13) === 1 || Math.floor(p.drawnCard / 13) === 2;

                    return (
                      <div key={i} className="text-center">
                        <div
                          className={`playing-card w-[70px] h-[100px] flex flex-col items-center justify-center mx-auto ${
                            isWinner ? "ring-2 ring-neon-green" : ""
                          }`}
                          style={{
                            borderColor: isRed ? "rgba(255, 0, 170, 0.3)" : "rgba(0, 240, 255, 0.3)",
                          }}
                        >
                          <span className={`font-display text-lg font-bold ${isRed ? "neon-text-magenta" : "neon-text-cyan"}`}>
                            {getCardName(p.drawnCard)}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-gray-500 mt-1">{shortAddr(p.addr)}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actions */}
          {isOpen && (
            <div className="flex gap-3">
              {!amIPlayer && g.playerCount < MAX_PLAYERS && !(isExpired && g.playerCount >= MIN_PLAYERS) && (
                <button
                  onClick={() => handleJoinGame(g.id)}
                  disabled={joinStep !== "idle" && joinStep !== "done" && joinStep !== "error"}
                  className="neon-btn neon-btn-yellow flex-1"
                >
                  {joinStep === "proving" ? "Generating Proof..." :
                   joinStep === "approving" ? "Approving..." :
                   joinStep === "joining" ? "Joining..." :
                   "JOIN GAME (10 TON)"}
                </button>
              )}
              {canClose && (
                <button
                  onClick={handleCloseGame}
                  disabled={closePending}
                  className="neon-btn neon-btn-green flex-1"
                >
                  {closePending ? "Closing..." : "CLOSE GAME"}
                </button>
              )}
              {canCancel && (
                <button
                  onClick={handleCancelGame}
                  disabled={closePending}
                  className="neon-btn neon-btn-magenta"
                >
                  {closePending ? "Cancelling..." : "CANCEL"}
                </button>
              )}
            </div>
          )}

          {/* Join Progress (in room view) */}
          {joinStep !== "idle" && joinStep !== "done" && (
            <div className="space-y-3">
              {joinStep === "proving" && (
                <ProofStatus
                  isGenerating={proof.isGenerating}
                  elapsed={proof.elapsed}
                  error={proof.error}
                  duration={proof.result?.duration}
                />
              )}
              {joinStep === "approving" && (
                <div className="glass-panel border border-neon-cyan/30 p-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-display tracking-wider neon-text-cyan">
                    Approving ERC20 transfer...
                  </span>
                </div>
              )}
              {joinStep === "joining" && (
                <TxStatus txHash={joinTxHash} isPending={true} isConfirmed={false} error={null} />
              )}
              {joinStep === "error" && (
                <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400">
                  <span className="font-display text-xs tracking-wider text-red-500 mr-2">ERROR</span>
                  {joinError}
                </div>
              )}
            </div>
          )}

          {/* Close/Cancel status */}
          {(closeTxHash || closeError) && (
            <TxStatus
              txHash={closeTxHash}
              isPending={closePending}
              isConfirmed={!closePending && !!closeTxHash}
              error={closeError}
            />
          )}
        </>
      )}
    </div>
  );
}
