import { useState } from "react";
import { StepCard } from "../components/StepCard";
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
  type F8SetupResult,
} from "../lib/cardUtils";
import { toBytes32 } from "../lib/crypto";
import { addNote } from "../lib/noteStore";
import { encryptedNoteBytes } from "../lib/noteUtils";
type Step = "setup" | "register" | "draw" | "drawing";

type DrawnCard = {
  index: number;
  card: number;
  name: string;
  txHash: string;
};

export function F8CardDrawPage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("CardDraw", signer);
  const proof = useProofGeneration();

  const [step, setStep] = useState<Step>("setup");
  const [gameIdInput, setGameIdInput] = useState("1");
  const [game, setGame] = useState<F8SetupResult | null>(null);
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [nextDrawIndex, setNextDrawIndex] = useState(0);

  // Registration tx state
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Draw tx state
  const [drawTxHash, setDrawTxHash] = useState<string | null>(null);
  const [drawTxPending, setDrawTxPending] = useState(false);
  const [drawTxConfirmed, setDrawTxConfirmed] = useState(false);
  const [drawTxError, setDrawTxError] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-green">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to use this demo.</p>
      </div>
    );
  }

  const stepStatus = (s: Step) => {
    const order: Step[] = ["setup", "register", "draw", "drawing"];
    const current = order.indexOf(step);
    const target = order.indexOf(s);
    if (s === "draw" && step === "drawing") return "active" as const;
    if (target < current) return "complete" as const;
    if (target === current) return "active" as const;
    return "disabled" as const;
  };

  async function handleSetup() {
    const result = await setupF8Game(BigInt(gameIdInput));
    setGame(result);
    setStep("register");
  }

  async function handleRegister() {
    if (!contract || !game) return;
    setRegError(null);
    setRegPending(true);
    try {
      const tx = await contract.registerDeck(
        toBytes32(game.deckCommitment),
        game.gameId,
        encryptedNoteBytes(),
      );
      setRegTxHash(tx.hash);
      await tx.wait();
      setRegConfirmed(true);
      setStep("draw");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegPending(false);
    }
  }

  async function handleDraw() {
    if (!contract || !game) return;
    setStep("drawing");
    setDrawTxHash(null);
    setDrawTxPending(false);
    setDrawTxConfirmed(false);
    setDrawTxError(null);
    proof.reset();

    const drawIndex = nextDrawIndex;
    const drawData = await prepareF8Draw(game, drawIndex);

    // Generate proof (~30s for 99K constraint circuit)
    const proofResult = await proof.generate(generateF8Proof, drawData.circuitInputs);
    if (!proofResult) return;

    // Submit tx
    setDrawTxPending(true);
    try {
      const { proof: p } = proofResult;
      const tx = await contract.drawCard(
        p.a, p.b, p.c,
        toBytes32(game.deckCommitment),
        toBytes32(drawData.drawCommitment),
        drawIndex,
        game.gameId,
        toBytes32(game.playerCommitment),
        encryptedNoteBytes(),
      );
      setDrawTxHash(tx.hash);
      await tx.wait();
      setDrawTxConfirmed(true);

      const cardName = getCardName(drawData.drawnCard);
      setDrawnCards((prev) => [
        ...prev,
        { index: drawIndex, card: drawData.drawnCard, name: cardName, txHash: tx.hash },
      ]);

      // Save drawn card note to local storage
      addNote({
        hash: toBytes32(drawData.drawCommitment),
        contractName: "CardDraw",
        type: "card",
        label: `Card: ${cardName} (Game #${game.gameId.toString()})`,
        metadata: {
          gameId: game.gameId.toString(),
          drawIndex: drawIndex.toString(),
          card: cardName,
          txHash: tx.hash,
        },
      });

      setNextDrawIndex(drawIndex + 1);
      setStep("draw");
    } catch (err) {
      setDrawTxError(err instanceof Error ? err.message : "Draw failed");
    } finally {
      setDrawTxPending(false);
    }
  }

  // Determine if a card is red (hearts/diamonds)
  const isRedCard = (card: number) => {
    const suit = Math.floor(card / 13);
    return suit === 1 || suit === 2; // hearts or diamonds
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-green rounded neon-text-green">
            SHUFFLE
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-green mb-1">
          F8: Card Draw
        </h1>
        <p className="text-sm font-body text-gray-500">
          Provably fair card game. A Fisher-Yates shuffle is verified in a 99K-constraint
          circuit. Each draw takes ~30 seconds for proof generation.
        </p>
      </div>

      {/* Step 1: Setup */}
      <StepCard step={1} title="Setup Game" status={stepStatus("setup")} accentColor="green">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Game ID</label>
            <input type="text" value={gameIdInput} onChange={(e) => setGameIdInput(e.target.value)} className="neon-input neon-input-green w-full" />
          </div>
          <p className="text-xs font-body text-gray-600">
            This will generate a keypair, shuffle a 52-card deck using Fisher-Yates
            with Poseidon VRF, and compute a deck commitment.
          </p>
          <button onClick={handleSetup} className="neon-btn neon-btn-green">
            Setup Game
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register Deck */}
      <StepCard step={2} title="Register Deck" status={stepStatus("register")} accentColor="green">
        {game && (
          <div className="space-y-3">
            <div className="text-xs space-y-1 glass-panel p-3">
              <p><span className="text-gray-600 font-display tracking-wider">DECK</span> <span className="font-mono text-neon-green/70 break-all">{toBytes32(game.deckCommitment).slice(0, 22)}...</span></p>
              <p><span className="text-gray-600 font-display tracking-wider">PLAYER</span> <span className="font-mono text-neon-green/70 break-all">{toBytes32(game.playerCommitment).slice(0, 22)}...</span></p>
            </div>
            <button onClick={handleRegister} disabled={regPending} className="neon-btn neon-btn-green">
              {regPending ? "Registering..." : "Register Deck On-Chain"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          </div>
        )}
      </StepCard>

      {/* Step 3: Draw Cards */}
      <StepCard step={3} title="Draw Cards" status={stepStatus("draw")} accentColor="green">
        <div className="space-y-4">
          {/* Hand display - Fan arrangement */}
          {drawnCards.length > 0 && (
            <div>
              <p className="text-xs font-display tracking-wider text-gray-500 mb-3">YOUR HAND</p>
              <div className="flex justify-center py-4">
                <div className="relative" style={{ height: "140px", width: `${Math.min(drawnCards.length * 50 + 70, 500)}px` }}>
                  {drawnCards.map((card, i) => {
                    const total = drawnCards.length;
                    const fanAngle = Math.min(5, 30 / total);
                    const rotation = (i - (total - 1) / 2) * fanAngle;
                    const yOffset = Math.abs(i - (total - 1) / 2) * 3;
                    const red = isRedCard(card.card);

                    return (
                      <div
                        key={card.index}
                        className="playing-card absolute w-[70px] h-[100px] flex flex-col items-center justify-center transition-all duration-500 hover:!-translate-y-4 hover:!z-50 cursor-pointer"
                        style={{
                          left: `${i * Math.min(50, 450 / total)}px`,
                          transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
                          zIndex: i + 1,
                          borderColor: red ? "rgba(255, 0, 170, 0.3)" : "rgba(0, 240, 255, 0.3)",
                        }}
                        title={`Draw #${card.index + 1}`}
                      >
                        <span
                          className={`font-display text-lg font-bold ${red ? "neon-text-magenta" : "neon-text-cyan"}`}
                        >
                          {card.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Draw button */}
          {nextDrawIndex < 52 && (
            <div className="space-y-3">
              <button
                onClick={handleDraw}
                disabled={step === "drawing"}
                className="neon-btn neon-btn-green"
              >
                {step === "drawing" ? "Drawing..." : `Draw Card #${nextDrawIndex + 1}`}
              </button>
              {nextDrawIndex === 0 && (
                <p className="text-xs font-body neon-text-yellow">
                  Warning: Each draw generates a 99K-constraint proof (~30s)
                </p>
              )}
            </div>
          )}

          {/* Proof / Tx status during draw */}
          {step === "drawing" && (
            <div className="space-y-3">
              <ProofStatus
                isGenerating={proof.isGenerating}
                elapsed={proof.elapsed}
                error={proof.error}
                duration={proof.result?.duration}
              />
              <TxStatus
                txHash={drawTxHash}
                isPending={drawTxPending}
                isConfirmed={drawTxConfirmed}
                error={drawTxError}
              />
            </div>
          )}
        </div>
      </StepCard>
    </div>
  );
}
