import { useState } from "react";
import { StepCard } from "../components/StepCard";
import { ProofStatus } from "../components/ProofStatus";
import { TxStatus } from "../components/TxStatus";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { useProofGeneration } from "../hooks/useProofGeneration";
import {
  setupF4BoxOpen,
  generateF4Proof,
  encryptedNoteBytes,
  type F4SetupResult,
} from "../lib/noteUtils";
import { toBytes32 } from "../lib/crypto";
import { addNote } from "../lib/noteStore";
import { RARITY_COLORS, type RarityLabel } from "../lib/types";
import type { ProofResult } from "../lib/types";

type Step = "setup" | "register" | "prove" | "open" | "done";

export function F4LootBoxPage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("LootBoxOpen", signer);
  const proof = useProofGeneration();

  const [step, setStep] = useState<Step>("setup");
  const [boxIdInput, setBoxIdInput] = useState("1");
  const [boxTypeInput, setBoxTypeInput] = useState("0");
  const [itemIdInput, setItemIdInput] = useState("5001");
  const [setup, setSetup] = useState<F4SetupResult | null>(null);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Registration tx state
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Open tx state
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [txConfirmed, setTxConfirmed] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-magenta">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to use this demo.</p>
      </div>
    );
  }

  const stepStatus = (s: Step) => {
    const order: Step[] = ["setup", "register", "prove", "open", "done"];
    const current = order.indexOf(step);
    const target = order.indexOf(s);
    if (target < current) return "complete" as const;
    if (target === current) return "active" as const;
    return "disabled" as const;
  };

  async function handleSetup() {
    const result = await setupF4BoxOpen(
      BigInt(boxIdInput),
      BigInt(boxTypeInput),
      BigInt(itemIdInput),
    );
    setSetup(result);
    setStep("register");
  }

  async function handleRegister() {
    if (!contract || !setup) return;
    setRegError(null);
    setRegPending(true);
    try {
      const tx = await contract.registerBox(
        toBytes32(setup.boxCommitment),
        setup.boxId,
        encryptedNoteBytes(),
      );
      setRegTxHash(tx.hash);
      await tx.wait();
      setRegConfirmed(true);
      setStep("prove");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegPending(false);
    }
  }

  async function handleProve() {
    if (!setup) return;
    const result = await proof.generate(generateF4Proof, setup.circuitInputs);
    if (result) {
      setProofResult(result);
      setStep("open");
    }
  }

  async function handleOpen() {
    if (!contract || !setup || !proofResult) return;
    setTxError(null);
    setTxPending(true);
    try {
      const { proof: p } = proofResult;
      const tx = await contract.openBox(
        p.a, p.b, p.c,
        toBytes32(setup.boxCommitment),
        toBytes32(setup.outcomeCommitment),
        setup.vrfOutput,
        setup.boxId,
        toBytes32(setup.nullifier),
        encryptedNoteBytes(),
      );
      setTxHash(tx.hash);
      await tx.wait();
      setTxConfirmed(true);

      // Save outcome note to local storage
      addNote({
        hash: toBytes32(setup.outcomeCommitment),
        contractName: "LootBoxOpen",
        type: "lootbox",
        label: `Loot Box #${setup.boxId.toString()} — ${setup.rarityLabel}`,
        metadata: {
          boxId: setup.boxId.toString(),
          rarity: setup.rarityLabel,
          itemId: setup.itemId.toString(),
          txHash: tx.hash,
        },
      });

      setStep("done");
      // Trigger reveal animation
      setTimeout(() => setRevealed(true), 300);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Open box failed");
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-magenta rounded neon-text-magenta">
            VRF
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-magenta mb-1">
          F4: Loot Box Open
        </h1>
        <p className="text-sm font-body text-gray-500">
          Open a loot box with verifiable randomness. A Poseidon VRF determines
          the item rarity, proven with a ZK circuit.
        </p>
      </div>

      {/* Step 1: Setup */}
      <StepCard step={1} title="Configure Box" status={stepStatus("setup")} accentColor="magenta">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Box ID</label>
              <input type="text" value={boxIdInput} onChange={(e) => setBoxIdInput(e.target.value)} className="neon-input neon-input-magenta w-full" />
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Box Type</label>
              <input type="text" value={boxTypeInput} onChange={(e) => setBoxTypeInput(e.target.value)} className="neon-input neon-input-magenta w-full" />
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Item ID</label>
              <input type="text" value={itemIdInput} onChange={(e) => setItemIdInput(e.target.value)} className="neon-input neon-input-magenta w-full" />
            </div>
          </div>
          <div className="text-xs font-body text-gray-600">
            Thresholds: <span className="neon-text-yellow">Legendary</span> &lt; 100, <span className="neon-text-purple">Epic</span> &lt; 500, <span className="neon-text-cyan">Rare</span> &lt; 2000, Common &lt; 10000
          </div>
          <button onClick={handleSetup} className="neon-btn neon-btn-magenta">
            Generate Keypair & Compute VRF
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register */}
      <StepCard step={2} title="Register Box" status={stepStatus("register")} accentColor="magenta">
        {setup && (
          <div className="space-y-3">
            <div className="text-xs space-y-1 glass-panel p-3">
              <p><span className="text-gray-600 font-display tracking-wider">COMMITMENT</span> <span className="font-mono text-neon-magenta/70 break-all">{toBytes32(setup.boxCommitment).slice(0, 22)}...</span></p>
              <p>
                <span className="text-gray-600 font-display tracking-wider">RARITY</span>{" "}
                <span className={`font-display font-bold ${RARITY_COLORS[setup.rarityLabel as RarityLabel] || "text-gray-400"}`}>
                  {setup.rarityLabel}
                </span>
              </p>
            </div>
            <button onClick={handleRegister} disabled={regPending} className="neon-btn neon-btn-magenta">
              {regPending ? "Registering..." : "Register Box On-Chain"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          </div>
        )}
      </StepCard>

      {/* Step 3: Generate Proof */}
      <StepCard step={3} title="Generate Open Proof" status={stepStatus("prove")} accentColor="magenta">
        <div className="space-y-3">
          <p className="text-sm text-gray-500 font-body">
            The ZK circuit verifies the VRF chain: nullifier &rarr; vrfOutput &rarr; rarity
            determination, all without revealing the secret key.
          </p>
          <button onClick={handleProve} disabled={proof.isGenerating} className="neon-btn neon-btn-magenta">
            {proof.isGenerating ? "Generating..." : "Generate ZK Proof"}
          </button>
          <ProofStatus isGenerating={proof.isGenerating} elapsed={proof.elapsed} error={proof.error} duration={proofResult?.duration} />
        </div>
      </StepCard>

      {/* Step 4: Open Box */}
      <StepCard step={4} title="Open Box" status={stepStatus("open")} accentColor="magenta">
        <div className="space-y-3">
          <button onClick={handleOpen} disabled={txPending} className="neon-btn neon-btn-magenta">
            {txPending ? "Opening..." : "Open Box On-Chain"}
          </button>
          <TxStatus txHash={txHash} isPending={txPending} isConfirmed={txConfirmed} error={txError} />
        </div>
      </StepCard>

      {/* Result - Loot Reveal */}
      {step === "done" && setup && (
        <div className="glass-panel border neon-border-magenta p-6 text-center scanline-overlay">
          <h3 className="font-display font-bold tracking-wider neon-text-magenta mb-4">LOOT REVEALED</h3>
          <div
            className={`transition-all duration-700 ${revealed ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
          >
            <div className="inline-block glass-panel border border-border-dim p-8 holographic rounded-xl">
              <p className={`font-display text-4xl font-black tracking-wider ${RARITY_COLORS[setup.rarityLabel as RarityLabel] || "text-gray-400"}`}
                style={{ animation: "glow-breathe 2s ease-in-out infinite" }}
              >
                {setup.rarityLabel}
              </p>
            </div>
            <p className="text-sm font-body text-gray-500 mt-4">
              Item ID: <span className="font-mono text-gray-400">{setup.itemId.toString()}</span>
              {" | "}
              Rarity Level: <span className="font-mono text-gray-400">{setup.itemRarity.toString()}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
