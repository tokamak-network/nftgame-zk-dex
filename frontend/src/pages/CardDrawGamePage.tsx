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
  type F8SetupResult,
} from "../lib/cardUtils";
import { toBytes32 } from "../lib/crypto";
import { ethers } from "ethers";

// ─── Types ───────────────────────────────────────────────────────────────────

type GameStatus = "Open" | "PendingReveal" | "Revealing" | "Finished" | "Cancelled";
const STATUS_MAP: GameStatus[] = ["Open", "PendingReveal", "Revealing", "Finished", "Cancelled"];

type GameInfo = {
  id: number;
  creator: string;
  status: GameStatus;
  commitTimeout: number;
  lastJoinTime: number;
  playerCount: number;
  revealedCount: number;
  prizePool: bigint;
  revealBlock: number;
  revealSeed: bigint;
  revealDeadline: number;
  winner: string;
  highestCardValue: number;
  createdAt: number;
};

type PlayerInfo = {
  addr: string;
  deckCommitment: string;
  playerCommitment: string;
  drawnCard: number;
  hasCommitted: boolean;
  hasRevealed: boolean;
};

type View = "list" | "room";

const ENTRY_FEE = ethers.parseEther("10");
const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;

// ─── localStorage helpers for F8SetupResult persistence ──────────────────────

function saveSetupResult(gameId: number, addr: string, result: F8SetupResult): void {
  try {
    const key = `f9-setup-${gameId}-${addr.toLowerCase()}`;
    // BigInt serialization: store as strings
    const serialized = JSON.stringify({
      playerSk: result.player.sk.toString(),
      playerPkX: result.player.pk.x.toString(),
      playerPkY: result.player.pk.y.toString(),
      deckCards: result.deckCards,
      deckCommitment: result.deckCommitment.toString(),
      deckSalt: result.deckSalt.toString(),
      shuffleSeed: result.shuffleSeed.toString(),
      gameId: result.gameId.toString(),
      playerCommitment: result.playerCommitment.toString(),
    });
    localStorage.setItem(key, serialized);
  } catch {
    console.error("Failed to save setup result to localStorage");
  }
}

function loadSetupResult(gameId: number, addr: string): F8SetupResult | null {
  try {
    const key = `f9-setup-${gameId}-${addr.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      player: {
        sk: BigInt(d.playerSk),
        pk: { x: BigInt(d.playerPkX), y: BigInt(d.playerPkY) },
      },
      deckCards: d.deckCards,
      deckCommitment: BigInt(d.deckCommitment),
      deckSalt: BigInt(d.deckSalt),
      shuffleSeed: BigInt(d.shuffleSeed),
      gameId: BigInt(d.gameId),
      playerCommitment: BigInt(d.playerCommitment),
    };
  } catch {
    return null;
  }
}

// ─── Parse contract responses ────────────────────────────────────────────────

function parseGame(raw: unknown[], id: number): GameInfo {
  // solidity struct field order matches Game struct
  // [creator, status, commitTimeout, lastJoinTime, playerCount, revealedCount,
  //  prizePool, revealBlock, prevRandaoSnapshot, revealSeed, revealDeadline, winner, highestCardValue, createdAt]
  const r = raw as [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, string, bigint, bigint];
  return {
    id,
    creator: r[0],
    status: STATUS_MAP[Number(r[1])],
    commitTimeout: Number(r[2]),
    lastJoinTime: Number(r[3]),
    playerCount: Number(r[4]),
    revealedCount: Number(r[5]),
    prizePool: r[6],
    revealBlock: Number(r[7]),
    // r[8] = prevRandaoSnapshot (not needed in UI)
    revealSeed: r[9],
    revealDeadline: Number(r[10]),
    winner: r[11],
    highestCardValue: Number(r[12]),
    createdAt: Number(r[13]),
  };
}

function parsePlayer(raw: unknown[]): PlayerInfo {
  const r = raw as [string, string, string, bigint, boolean, boolean];
  return {
    addr: r[0],
    deckCommitment: r[1],
    playerCommitment: r[2],
    drawnCard: Number(r[3]),
    hasCommitted: r[4],
    hasRevealed: r[5],
  };
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

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  const [currentBlock, setCurrentBlock] = useState(0);

  // Create game
  const [timeoutInput, setTimeoutInput] = useState("60");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Commit (join) state
  const [commitStep, setCommitStep] = useState<"idle" | "computing" | "approving" | "submitting" | "done" | "error">("idle");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitTxHash, setCommitTxHash] = useState<string | null>(null);
  const [localSetup, setLocalSetup] = useState<F8SetupResult | null>(null);

  // Reveal state
  const [revealStep, setRevealStep] = useState<"idle" | "proving" | "submitting" | "done" | "error">("idle");
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealTxHash, setRevealTxHash] = useState<string | null>(null);
  const [myRevealedCard, setMyRevealedCard] = useState<number | null>(null);

  // startReveal / close / cancel tx state
  const [actionPending, setActionPending] = useState(false);
  const [actionTxHash, setActionTxHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevGameStatusRef = useRef<GameStatus | null>(null);

  // 1-second clock
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Browser notification permission request (once on mount)
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Fire browser notification when the current room transitions to Revealing
  // and the user is a participant
  useEffect(() => {
    if (!selectedGame || !address) return;
    const prev = prevGameStatusRef.current;
    const curr = selectedGame.status;

    if (prev !== "Revealing" && curr === "Revealing") {
      const amIPlayer = players.some(
        (p) => p.addr.toLowerCase() === address.toLowerCase()
      );
      if (amIPlayer && !players.find(
        (p) => p.addr.toLowerCase() === address.toLowerCase()
      )?.hasRevealed) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`Game #${selectedGame.id} — REVEAL NOW!`, {
            body: `You have ${Math.floor((selectedGame.revealDeadline - Date.now() / 1000))}s to submit your ZK proof. Don't forfeit your entry fee!`,
            tag: `reveal-${selectedGame.id}`,
          });
        }
      }
    }

    prevGameStatusRef.current = curr;
  }, [selectedGame, players, address]);

  // Block number polling (for PendingReveal phase)
  useEffect(() => {
    if (!signer) return;
    const fetchBlock = async () => {
      try {
        const n = await signer.provider.getBlockNumber();
        setCurrentBlock(n);
      } catch { /* ignore */ }
    };
    fetchBlock();
    const t = setInterval(fetchBlock, 2000);
    return () => clearInterval(t);
  }, [signer]);

  // Restore local setup from localStorage when entering room view
  useEffect(() => {
    if (view === "room" && selectedGameId && address) {
      const saved = loadSetupResult(selectedGameId, address);
      if (saved) setLocalSetup(saved);
    }
  }, [view, selectedGameId, address]);

  // ── Polling ──────────────────────────────────────────────────────────────

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
      console.error("fetchGames failed:", err);
    }
  }, [gameContract]);

  const fetchGameDetail = useCallback(async () => {
    if (!gameContract || !selectedGameId) return;
    try {
      const raw = await gameContract.getGame(selectedGameId);
      setSelectedGame(parseGame(raw, selectedGameId));
      const rawPlayers = await gameContract.getGamePlayers(selectedGameId);
      setPlayers(rawPlayers.map((p: unknown[]) => parsePlayer(p)));
    } catch (err) {
      console.error("fetchGameDetail failed:", err);
    }
  }, [gameContract, selectedGameId]);

  useEffect(() => {
    if (!gameContract) return;
    const poll = view === "list" ? fetchGames : fetchGameDetail;
    const interval = view === "list" ? 5000 : 3000;
    poll();
    pollRef.current = setInterval(poll, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [gameContract, view, fetchGames, fetchGameDetail]);

  // ── Create Game ───────────────────────────────────────────────────────────

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

  // ── Commit Phase: joinGame ────────────────────────────────────────────────
  // Phase 1: compute setup → approve → joinGame(deckCommitment, playerCommitment)
  // No ZK proof. Player doesn't know their card yet.

  async function handleJoinGame(gameId: number) {
    if (!gameContract || !tokenContract || !address) return;
    setCommitStep("computing");
    setCommitError(null);
    setCommitTxHash(null);
    setLocalSetup(null);

    try {
      // Compute deck setup (fisher-yates shuffle + commitments)
      const setup = await setupF8Game(BigInt(gameId));

      // Persist to localStorage (needed for the reveal phase, possibly after page reload)
      saveSetupResult(gameId, address, setup);
      setLocalSetup(setup);

      // Approve ERC20
      setCommitStep("approving");
      const contractAddr = await gameContract.getAddress();
      const approveTx = await tokenContract.approve(contractAddr, ENTRY_FEE);
      await approveTx.wait();

      // Submit joinGame (no ZK proof)
      setCommitStep("submitting");
      const tx = await gameContract.joinGame(
        gameId,
        toBytes32(setup.deckCommitment),
        toBytes32(setup.playerCommitment),
      );
      setCommitTxHash(tx.hash);
      await tx.wait();

      setCommitStep("done");
      await fetchGameDetail();
    } catch (err) {
      setCommitStep("error");
      setCommitError(err instanceof Error ? err.message : "Join failed");
    }
  }

  // ── Reveal Phase: revealCard ──────────────────────────────────────────────
  // Phase 2: query drawIndex from contract → generate ZK proof → revealCard

  async function handleRevealCard(gameId: number) {
    if (!gameContract || !address) return;

    // Need the locally-saved F8SetupResult
    const setup = localSetup ?? loadSetupResult(gameId, address);
    if (!setup) {
      setRevealStep("error");
      setRevealError("Local deck data not found. Did you join from this browser?");
      return;
    }

    setRevealStep("proving");
    setRevealError(null);
    setRevealTxHash(null);
    setMyRevealedCard(null);
    proof.reset();

    try {
      // Query the externally-determined drawIndex (from revealSeed + player address)
      const drawIndex = Number(await gameContract.getPlayerDrawIndex(gameId, address));

      // Prepare draw with the determined drawIndex
      const drawData = await prepareF8Draw(setup, drawIndex);

      // Generate ZK proof (~30s)
      const proofResult = await proof.generate(generateF8Proof, drawData.circuitInputs);
      if (!proofResult) {
        setRevealStep("error");
        setRevealError("Proof generation failed");
        return;
      }

      // Submit revealCard
      setRevealStep("submitting");
      const { proof: p } = proofResult;
      const tx = await gameContract.revealCard(
        gameId,
        p.a, p.b, p.c,
        toBytes32(drawData.drawCommitment),
        drawData.drawnCard,
      );
      setRevealTxHash(tx.hash);
      await tx.wait();

      setMyRevealedCard(drawData.drawnCard);
      setRevealStep("done");
      await fetchGameDetail();
    } catch (err) {
      setRevealStep("error");
      setRevealError(err instanceof Error ? err.message : "Reveal failed");
    }
  }

  // ── finalizeReveal ─────────────────────────────────────────────────────────

  async function handleFinalizeReveal(gameId: number) {
    if (!gameContract) return;
    setActionPending(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const tx = await gameContract.finalizeReveal(gameId);
      setActionTxHash(tx.hash);
      await tx.wait();
      await fetchGameDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "finalizeReveal failed");
    } finally {
      setActionPending(false);
    }
  }

  // ── startReveal ────────────────────────────────────────────────────────────

  async function handleStartReveal(gameId: number) {
    if (!gameContract) return;
    setActionPending(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const tx = await gameContract.startReveal(gameId);
      setActionTxHash(tx.hash);
      await tx.wait();
      await fetchGameDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "startReveal failed");
    } finally {
      setActionPending(false);
    }
  }

  // ── closeGame ──────────────────────────────────────────────────────────────

  async function handleCloseGame(gameId: number) {
    if (!gameContract) return;
    setActionPending(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const tx = await gameContract.closeGame(gameId);
      setActionTxHash(tx.hash);
      await tx.wait();
      await fetchGameDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "closeGame failed");
    } finally {
      setActionPending(false);
    }
  }

  // ── cancelGame ────────────────────────────────────────────────────────────

  async function handleCancelGame(gameId: number) {
    if (!gameContract) return;
    setActionPending(true);
    setActionError(null);
    setActionTxHash(null);
    try {
      const tx = await gameContract.cancelGame(gameId);
      setActionTxHash(tx.hash);
      await tx.wait();
      setView("list");
      await fetchGames();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "cancelGame failed");
    } finally {
      setActionPending(false);
    }
  }

  // ── Navigate to room ──────────────────────────────────────────────────────

  function openRoom(gameId: number) {
    setSelectedGameId(gameId);
    setSelectedGame(null);
    setPlayers([]);
    setCommitStep("idle");
    setRevealStep("idle");
    setActionError(null);
    setActionTxHash(null);
    proof.reset();
    setView("room");
  }

  function backToList() {
    setView("list");
    setSelectedGameId(null);
    setSelectedGame(null);
    setPlayers([]);
  }

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-yellow">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to play.</p>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ────────────────────────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 stagger-in">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-yellow rounded neon-text-yellow">
              MULTIPLAYER · COMMIT-REVEAL
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-wider neon-text-yellow mb-1">
            F9: Card Draw Game
          </h1>
          <p className="text-sm font-body text-gray-500">
            Two-phase fair game. Commit your deck, then reveal after on-chain randomness decides your draw position.
            Entry: 10 TON · Highest card wins.
          </p>
        </div>

        {/* Create Game */}
        <div className="glass-panel border neon-border-yellow p-5">
          <h3 className="font-display font-bold text-sm tracking-wide neon-text-yellow mb-3">
            CREATE GAME
          </h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">
                Commit Timeout (seconds, min 30)
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
              {createPending ? "Creating..." : "Create"}
            </button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-2">{createError}</p>}
        </div>

        {/* Game list */}
        <div className="space-y-2">
          {games.length === 0 && (
            <div className="glass-panel border border-border-dim p-6 text-center">
              <p className="text-sm text-gray-500">No games yet. Create one!</p>
            </div>
          )}
          {games.map((g) => {
            const isOpen = g.status === "Open";
            const isRevealing = g.status === "Revealing";
            const commitRemaining = g.playerCount >= MIN_PLAYERS && g.lastJoinTime > 0
              ? g.lastJoinTime + g.commitTimeout - now : null;
            const revealRemaining = isRevealing && g.revealDeadline > 0
              ? g.revealDeadline - now : null;
            const commitExpired = commitRemaining !== null && commitRemaining <= 0;
            const canJoin = isOpen && g.playerCount < MAX_PLAYERS && !commitExpired;

            return (
              <div
                key={g.id}
                className={`glass-panel border p-4 ${
                  isOpen ? "border-neon-yellow/40" :
                  g.status === "PendingReveal" ? "border-neon-magenta/40" :
                  isRevealing ? "border-neon-cyan/40" :
                  g.status === "Finished" ? "border-neon-green/30" :
                  "border-border-dim"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-display text-sm font-bold neon-text-yellow">#{g.id}</span>
                    <span className="text-xs text-gray-400">{g.playerCount}/{MAX_PLAYERS}</span>
                    <span className="text-xs font-mono neon-text-cyan">{ethers.formatEther(g.prizePool)} TON</span>

                    {isOpen && g.playerCount < MIN_PLAYERS && (
                      <span className="text-xs text-gray-500">Waiting for players...</span>
                    )}
                    {isOpen && commitRemaining !== null && commitRemaining > 0 && (
                      <span className="text-xs font-mono neon-text-yellow">
                        Commit: {formatCountdown(commitRemaining)}
                      </span>
                    )}
                    {isOpen && commitExpired && g.playerCount >= MIN_PLAYERS && (
                      <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 bg-neon-cyan/20 neon-text-cyan rounded">
                        START REVEAL
                      </span>
                    )}
                    {g.status === "PendingReveal" && (
                      <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 bg-neon-magenta/20 neon-text-magenta rounded">
                        AWAITING BLOCK #{g.revealBlock}
                      </span>
                    )}
                    {isRevealing && revealRemaining !== null && revealRemaining > 0 && (
                      <span className={`text-xs font-mono font-bold ${
                        revealRemaining <= 30 ? "text-red-400 animate-pulse" : "neon-text-cyan"
                      }`}>
                        Reveal: {formatCountdown(revealRemaining)}
                      </span>
                    )}
                    {isRevealing && revealRemaining !== null && revealRemaining <= 0 && (
                      <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 bg-neon-green/20 neon-text-green rounded">
                        READY TO CLOSE
                      </span>
                    )}
                    {g.status === "Finished" && (
                      <span className="text-xs text-gray-400">
                        Winner: {getCardName(g.highestCardValue)}
                      </span>
                    )}
                    {g.status === "Cancelled" && (
                      <span className="text-xs text-gray-500">Cancelled</span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canJoin && (
                      <button
                        onClick={() => { openRoom(g.id); }}
                        className="neon-btn neon-btn-yellow text-xs py-1.5 px-3"
                      >
                        JOIN
                      </button>
                    )}
                    <button
                      onClick={() => openRoom(g.id)}
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
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ROOM VIEW
  // ────────────────────────────────────────────────────────────────────────────

  const g = selectedGame;
  const isOpen = g?.status === "Open";
  const isPendingReveal = g?.status === "PendingReveal";
  const isRevealing = g?.status === "Revealing";
  const isFinished = g?.status === "Finished";
  const isCancelled = g?.status === "Cancelled";

  const amIPlayer = players.some(
    (p) => address && p.addr.toLowerCase() === address.toLowerCase()
  );
  const myPlayer = players.find(
    (p) => address && p.addr.toLowerCase() === address.toLowerCase()
  );
  const isCreator = g && address && g.creator.toLowerCase() === address.toLowerCase();

  const commitRemaining = g && g.playerCount >= MIN_PLAYERS && g.lastJoinTime > 0
    ? g.lastJoinTime + g.commitTimeout - now : null;
  const commitExpired = commitRemaining !== null && commitRemaining <= 0;
  const revealRemaining = isRevealing && g && g.revealDeadline > 0
    ? g.revealDeadline - now : null;

  const canStartReveal = isOpen && g && g.playerCount >= MIN_PLAYERS &&
    (g.playerCount >= MAX_PLAYERS || commitExpired);
  const canFinalizeReveal = isPendingReveal && g && currentBlock > g.revealBlock;
  const canClose = isRevealing && g &&
    (g.revealedCount === g.playerCount || (revealRemaining !== null && revealRemaining <= 0));
  const canCancel = isOpen && isCreator;
  const canJoin = isOpen && !amIPlayer && g && g.playerCount < MAX_PLAYERS && !commitExpired;
  const canReveal = isRevealing && amIPlayer && myPlayer && !myPlayer.hasRevealed &&
    revealRemaining !== null && revealRemaining > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5 stagger-in">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={backToList}
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
              isPendingReveal ? "bg-neon-magenta/20 neon-text-magenta" :
              isRevealing ? "bg-neon-cyan/20 neon-text-cyan" :
              isFinished ? "bg-neon-green/20 neon-text-green" :
              "bg-gray-700 text-gray-400"
            }`}>
              {g.status === "PendingReveal" ? "PENDING REVEAL" : g.status.toUpperCase()}
            </span>
            {isOpen && commitRemaining !== null && commitRemaining > 0 && (
              <span className="text-sm font-mono neon-text-yellow">
                Commit: {formatCountdown(commitRemaining)}
              </span>
            )}
            {isPendingReveal && g.revealBlock > 0 && (
              <span className="text-sm font-mono neon-text-magenta">
                {currentBlock > g.revealBlock
                  ? "Ready to finalize"
                  : `Block ${g.revealBlock} (now: ${currentBlock})`}
              </span>
            )}
            {isRevealing && revealRemaining !== null && (
              <span className={`text-sm font-mono font-bold ${
                revealRemaining <= 0 ? "neon-text-green" :
                revealRemaining <= 30 ? "text-red-400 animate-pulse" :
                "neon-text-cyan"
              }`}>
                {revealRemaining <= 0 ? "READY TO CLOSE" : `Reveal: ${formatCountdown(revealRemaining)}`}
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
          {/* Game Stats */}
          <div className="glass-panel border neon-border-yellow p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">PRIZE POOL</p>
                <p className="font-mono text-lg neon-text-cyan">{ethers.formatEther(g.prizePool)} TON</p>
              </div>
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">PLAYERS</p>
                <p className="font-mono text-lg neon-text-yellow">
                  {g.playerCount}/{MAX_PLAYERS}
                  {isRevealing && ` (${g.revealedCount} revealed)`}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-display tracking-wider text-gray-500">PHASE</p>
                <p className="font-mono text-sm text-gray-300">
                  {isOpen ? "Commit" : isPendingReveal ? "Pending" : isRevealing ? "Reveal" : g.status}
                </p>
              </div>
            </div>

            {/* Phase explanation */}
            {isOpen && (
              <p className="text-[11px] font-body text-gray-600 mt-3 text-center">
                Commit phase: players submit their deck commitment. Card position is unknown until reveal.
              </p>
            )}
            {isPendingReveal && (
              <div className="mt-3 text-center space-y-1">
                <p className="text-[11px] font-body text-gray-500">
                  Waiting for block <span className="font-mono neon-text-magenta">#{g.revealBlock}</span> to be mined.
                  Seed is unknown to everyone until that block exists.
                </p>
                {currentBlock > 0 && (
                  <p className="text-[11px] font-mono text-gray-600">
                    Current block: {currentBlock} · Target: {g.revealBlock}
                    {currentBlock > g.revealBlock
                      ? " ✓ Ready"
                      : ` · ${g.revealBlock - currentBlock} block(s) remaining`}
                  </p>
                )}
              </div>
            )}
            {isRevealing && g.revealSeed !== 0n && (
              <p className="text-[11px] font-body text-gray-600 mt-3 text-center">
                Reveal phase: each player's draw position is determined by on-chain randomness. Seed: {g.revealSeed.toString().slice(0, 16)}...
              </p>
            )}
          </div>

          {/* Player List */}
          <div className="glass-panel border border-border-dim p-5">
            <h3 className="font-display font-bold text-sm tracking-wide text-gray-400 mb-3">
              PLAYERS
            </h3>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500">No players yet.</p>
            ) : (
              <div className="space-y-2">
                {players.map((p, i) => {
                  const isMe = address && p.addr.toLowerCase() === address.toLowerCase();
                  const showCard = (isFinished || isCancelled) && p.hasRevealed;
                  const showMyCard = isMe && (myRevealedCard !== null) && p.hasRevealed;
                  const displayCard = showMyCard ? myRevealedCard! : (showCard ? p.drawnCard : null);

                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-3 rounded ${
                        isMe ? "bg-neon-yellow/10 border border-neon-yellow/30" : "bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{shortAddr(p.addr)}</span>
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
                      <div className="flex items-center gap-2 text-xs">
                        {/* Status badges */}
                        <span className={`text-[10px] font-mono ${p.hasCommitted ? "text-neon-yellow" : "text-gray-600"}`}>
                          {p.hasCommitted ? "COMMITTED" : ""}
                        </span>
                        {p.hasRevealed && (
                          <span className="text-[10px] font-mono neon-text-green">REVEALED</span>
                        )}
                        {isRevealing && !p.hasRevealed && (
                          <span className="text-[10px] font-mono text-gray-500">PENDING</span>
                        )}
                        {/* Card display */}
                        {displayCard !== null ? (
                          <>
                            <span className={`font-display font-bold ${getCardColor(displayCard)}`}>
                              {getCardName(displayCard)}
                            </span>
                            <span className="text-[10px] font-mono text-gray-500">
                              ({cardScore(displayCard)}pts)
                            </span>
                          </>
                        ) : (isRevealing || isFinished) ? (
                          <span className="text-gray-600 font-mono">?</span>
                        ) : null}
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
              <p className="font-display text-lg font-bold neon-text-green">{shortAddr(g.winner)}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className={`font-display text-2xl font-bold ${getCardColor(g.highestCardValue)}`}>
                  {getCardName(g.highestCardValue)}
                </span>
                <span className="text-xs font-mono text-gray-500">({cardScore(g.highestCardValue)}pts)</span>
              </div>
              <p className="text-sm font-mono text-gray-400 mt-2">
                Prize: {ethers.formatEther(g.prizePool * BigInt(g.revealedCount) / BigInt(g.playerCount) * 90n / 100n)} TON
                {g.revealedCount < g.playerCount && (
                  <span className="text-gray-500 text-xs"> ({g.playerCount - g.revealedCount} forfeited)</span>
                )}
              </p>
            </div>
          )}

          {/* Revealed cards fan (after game ends) */}
          {isFinished && players.filter((p) => p.hasRevealed).length > 0 && (
            <div className="glass-panel border border-border-dim p-5">
              <h3 className="font-display font-bold text-sm tracking-wide text-gray-400 mb-3">ALL REVEALED CARDS</h3>
              <div className="flex justify-center gap-4 py-2 flex-wrap">
                {[...players]
                  .filter((p) => p.hasRevealed)
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
                          style={{ borderColor: isRed ? "rgba(255,0,170,0.3)" : "rgba(0,240,255,0.3)" }}
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

          {/* ── Reveal Countdown Banner ───────────────────────────── */}
          {isRevealing && canReveal && revealRemaining !== null && revealRemaining > 0 && (
            <div className={`glass-panel border p-4 text-center ${
              revealRemaining <= 30
                ? "border-red-500/60 bg-red-900/20 animate-pulse"
                : "border-neon-cyan/40"
            }`}>
              <p className={`font-display text-xs tracking-wider mb-1 ${
                revealRemaining <= 30 ? "text-red-400" : "neon-text-cyan"
              }`}>
                {revealRemaining <= 30 ? "URGENT — REVEAL NOW!" : "REVEAL PHASE ACTIVE"}
              </p>
              <p className={`font-mono text-3xl font-bold ${
                revealRemaining <= 30 ? "text-red-400" : "neon-text-cyan"
              }`}>
                {formatCountdown(revealRemaining)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {revealRemaining <= 30
                  ? "Entry fee will be forfeited if you don't reveal!"
                  : "Submit your ZK proof before the deadline"}
              </p>
            </div>
          )}

          {/* ── Action Buttons ─────────────────────────────────────── */}
          <div className="space-y-3">
            {/* JOIN (commit phase) */}
            {canJoin && (
              <button
                onClick={() => handleJoinGame(g.id)}
                disabled={commitStep !== "idle" && commitStep !== "done" && commitStep !== "error"}
                className="neon-btn neon-btn-yellow w-full"
              >
                {commitStep === "computing" ? "Computing deck..." :
                 commitStep === "approving" ? "Approving ERC20..." :
                 commitStep === "submitting" ? "Submitting commit..." :
                 "JOIN GAME — Commit Deck (10 TON)"}
              </button>
            )}

            {/* REVEAL (reveal phase) */}
            {canReveal && (
              <button
                onClick={() => handleRevealCard(g.id)}
                disabled={revealStep !== "idle" && revealStep !== "error"}
                className="neon-btn neon-btn-cyan w-full"
              >
                {revealStep === "proving" ? "Generating ZK proof..." :
                 revealStep === "submitting" ? "Submitting reveal..." :
                 "REVEAL CARD — Submit ZK Proof"}
              </button>
            )}

            {/* START REVEAL */}
            {canStartReveal && (
              <button
                onClick={() => handleStartReveal(g.id)}
                disabled={actionPending}
                className="neon-btn neon-btn-cyan w-full"
              >
                {actionPending ? "Starting reveal..." : "START REVEAL PHASE"}
              </button>
            )}

            {/* FINALIZE REVEAL (PendingReveal → Revealing) */}
            {isPendingReveal && !canFinalizeReveal && g.revealBlock > 0 && (
              <div className="glass-panel border border-neon-magenta/30 p-3 text-center">
                <p className="text-xs font-display tracking-wider neon-text-magenta">
                  WAITING FOR BLOCK #{g.revealBlock}
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Current: {currentBlock || "..."} · {g.revealBlock - (currentBlock || 0)} block(s) remaining
                </p>
              </div>
            )}
            {canFinalizeReveal && (
              <button
                onClick={() => handleFinalizeReveal(g.id)}
                disabled={actionPending}
                className="neon-btn neon-btn-magenta w-full"
              >
                {actionPending ? "Finalizing..." : `FINALIZE REVEAL — Derive Seed from Block #${g.revealBlock}`}
              </button>
            )}

            {/* CLOSE GAME */}
            {canClose && (
              <button
                onClick={() => handleCloseGame(g.id)}
                disabled={actionPending}
                className="neon-btn neon-btn-green w-full"
              >
                {actionPending ? "Closing..." : "CLOSE GAME — Determine Winner"}
              </button>
            )}

            {/* CANCEL */}
            {canCancel && (
              <button
                onClick={() => handleCancelGame(g.id)}
                disabled={actionPending}
                className="neon-btn neon-btn-magenta"
              >
                {actionPending ? "Cancelling..." : "CANCEL GAME"}
              </button>
            )}
          </div>

          {/* ── Commit Progress ───────────────────────────────────── */}
          {commitStep !== "idle" && (
            <div className="space-y-2">
              {commitStep === "computing" && (
                <div className="glass-panel border border-neon-yellow/30 p-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-neon-yellow border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-display tracking-wider neon-text-yellow">
                    Computing deck commitment...
                  </span>
                </div>
              )}
              {commitStep === "approving" && (
                <div className="glass-panel border border-neon-yellow/30 p-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-neon-yellow border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-display tracking-wider neon-text-yellow">Approving ERC20...</span>
                </div>
              )}
              {commitStep === "submitting" && (
                <TxStatus txHash={commitTxHash} isPending={true} isConfirmed={false} error={null} />
              )}
              {commitStep === "done" && (
                <div className="glass-panel border border-neon-green/30 p-3 text-sm">
                  <span className="font-display text-xs tracking-wider neon-text-green mr-2">COMMITTED</span>
                  <span className="font-body text-gray-300">
                    Deck committed. Wait for reveal phase to see your card.
                  </span>
                </div>
              )}
              {commitStep === "error" && (
                <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400">
                  <span className="font-display text-xs tracking-wider text-red-500 mr-2">ERROR</span>
                  {commitError}
                </div>
              )}
            </div>
          )}

          {/* ── Reveal Progress ───────────────────────────────────── */}
          {revealStep !== "idle" && (
            <div className="space-y-2">
              {revealStep === "proving" && (
                <ProofStatus
                  isGenerating={proof.isGenerating}
                  elapsed={proof.elapsed}
                  error={proof.error}
                  duration={proof.result?.duration}
                />
              )}
              {revealStep === "submitting" && (
                <TxStatus txHash={revealTxHash} isPending={true} isConfirmed={false} error={null} />
              )}
              {revealStep === "done" && myRevealedCard !== null && (
                <div className="glass-panel border border-neon-green/30 p-3 text-sm">
                  <span className="font-display text-xs tracking-wider neon-text-green mr-2">REVEALED</span>
                  <span className="font-body text-gray-300">
                    Your card:{" "}
                    <span className={`font-bold font-display ${getCardColor(myRevealedCard)}`}>
                      {getCardName(myRevealedCard)}
                    </span>
                  </span>
                </div>
              )}
              {revealStep === "error" && (
                <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400">
                  <span className="font-display text-xs tracking-wider text-red-500 mr-2">ERROR</span>
                  {revealError}
                </div>
              )}
            </div>
          )}

          {/* ── Action Tx Status ──────────────────────────────────── */}
          {(actionTxHash || actionError) && (
            <TxStatus
              txHash={actionTxHash}
              isPending={actionPending}
              isConfirmed={!actionPending && !!actionTxHash}
              error={actionError}
            />
          )}
        </>
      )}
    </div>
  );
}
