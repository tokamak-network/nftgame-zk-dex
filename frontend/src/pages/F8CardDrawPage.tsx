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
  getCardColor,
  type F8SetupResult,
} from "../lib/cardUtils";
import { toBytes32 } from "../lib/crypto";
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
    return <p className="text-gray-400">Connect your wallet to use this demo.</p>;
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
      setNextDrawIndex(drawIndex + 1);
      setStep("draw");
    } catch (err) {
      setDrawTxError(err instanceof Error ? err.message : "Draw failed");
    } finally {
      setDrawTxPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">F8: Card Draw</h1>
        <p className="text-sm text-gray-400">
          Provably fair card game. A Fisher-Yates shuffle is verified in a 99K-constraint
          circuit. Each draw takes ~30 seconds for proof generation.
        </p>
      </div>

      {/* Step 1: Setup */}
      <StepCard step={1} title="Setup Game" status={stepStatus("setup")}>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Game ID</label>
            <input type="text" value={gameIdInput} onChange={(e) => setGameIdInput(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full" />
          </div>
          <p className="text-xs text-gray-500">
            This will generate a keypair, shuffle a 52-card deck using Fisher-Yates
            with Poseidon VRF, and compute a deck commitment.
          </p>
          <button onClick={handleSetup} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors">
            Setup Game
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register Deck */}
      <StepCard step={2} title="Register Deck" status={stepStatus("register")}>
        {game && (
          <div className="space-y-3">
            <div className="text-xs space-y-1 bg-gray-800/50 rounded-lg p-3">
              <p><span className="text-gray-500">Deck Commitment:</span> <span className="font-mono break-all">{toBytes32(game.deckCommitment).slice(0, 22)}...</span></p>
              <p><span className="text-gray-500">Player Commitment:</span> <span className="font-mono break-all">{toBytes32(game.playerCommitment).slice(0, 22)}...</span></p>
            </div>
            <button onClick={handleRegister} disabled={regPending} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {regPending ? "Registering..." : "Register Deck On-Chain"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          </div>
        )}
      </StepCard>

      {/* Step 3: Draw Cards */}
      <StepCard step={3} title="Draw Cards" status={stepStatus("draw")}>
        <div className="space-y-4">
          {/* Hand display */}
          {drawnCards.length > 0 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Your hand:</p>
              <div className="flex flex-wrap gap-2">
                {drawnCards.map((card) => (
                  <div
                    key={card.index}
                    className={`bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-center ${getCardColor(card.card)}`}
                  >
                    <span className="text-lg font-bold">{card.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draw button */}
          {nextDrawIndex < 52 && (
            <div className="space-y-3">
              <button
                onClick={handleDraw}
                disabled={step === "drawing"}
                className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {step === "drawing" ? "Drawing..." : `Draw Card #${nextDrawIndex + 1}`}
              </button>
              {nextDrawIndex === 0 && (
                <p className="text-xs text-yellow-400">
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
