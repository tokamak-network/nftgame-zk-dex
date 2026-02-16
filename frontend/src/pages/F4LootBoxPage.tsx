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
    return <p className="text-gray-400">Connect your wallet to use this demo.</p>;
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
      setStep("done");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Open box failed");
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">F4: Loot Box Open</h1>
        <p className="text-sm text-gray-400">
          Open a loot box with verifiable randomness. A Poseidon VRF determines
          the item rarity, proven with a ZK circuit.
        </p>
      </div>

      {/* Step 1: Setup */}
      <StepCard step={1} title="Configure Box" status={stepStatus("setup")}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Box ID</label>
              <input type="text" value={boxIdInput} onChange={(e) => setBoxIdInput(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Box Type</label>
              <input type="text" value={boxTypeInput} onChange={(e) => setBoxTypeInput(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Item ID</label>
              <input type="text" value={itemIdInput} onChange={(e) => setItemIdInput(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full" />
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Thresholds: Legendary &lt; 100, Epic &lt; 500, Rare &lt; 2000, Common &lt; 10000
          </div>
          <button onClick={handleSetup} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors">
            Generate Keypair & Compute VRF
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register */}
      <StepCard step={2} title="Register Box" status={stepStatus("register")}>
        {setup && (
          <div className="space-y-3">
            <div className="text-xs space-y-1 bg-gray-800/50 rounded-lg p-3">
              <p><span className="text-gray-500">Box Commitment:</span> <span className="font-mono break-all">{toBytes32(setup.boxCommitment).slice(0, 22)}...</span></p>
              <p>
                <span className="text-gray-500">VRF Rarity:</span>{" "}
                <span className={`font-bold ${RARITY_COLORS[setup.rarityLabel as RarityLabel] || "text-gray-400"}`}>
                  {setup.rarityLabel}
                </span>
              </p>
            </div>
            <button onClick={handleRegister} disabled={regPending} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {regPending ? "Registering..." : "Register Box On-Chain"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          </div>
        )}
      </StepCard>

      {/* Step 3: Generate Proof */}
      <StepCard step={3} title="Generate Open Proof" status={stepStatus("prove")}>
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            The ZK circuit verifies the VRF chain: nullifier &rarr; vrfOutput &rarr; rarity
            determination, all without revealing the secret key.
          </p>
          <button onClick={handleProve} disabled={proof.isGenerating} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {proof.isGenerating ? "Generating..." : "Generate ZK Proof"}
          </button>
          <ProofStatus isGenerating={proof.isGenerating} elapsed={proof.elapsed} error={proof.error} duration={proofResult?.duration} />
        </div>
      </StepCard>

      {/* Step 4: Open Box */}
      <StepCard step={4} title="Open Box" status={stepStatus("open")}>
        <div className="space-y-3">
          <button onClick={handleOpen} disabled={txPending} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {txPending ? "Opening..." : "Open Box On-Chain"}
          </button>
          <TxStatus txHash={txHash} isPending={txPending} isConfirmed={txConfirmed} error={txError} />
        </div>
      </StepCard>

      {/* Result */}
      {step === "done" && setup && (
        <div className="border border-green-600/50 bg-green-600/5 rounded-xl p-5">
          <h3 className="font-semibold text-green-400 mb-3">Box Opened!</h3>
          <div className="text-center py-4">
            <p className={`text-3xl font-bold ${RARITY_COLORS[setup.rarityLabel as RarityLabel] || "text-gray-400"}`}>
              {setup.rarityLabel}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Item ID: {setup.itemId.toString()} | Rarity Level: {setup.itemRarity.toString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
