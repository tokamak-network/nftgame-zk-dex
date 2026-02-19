import { useState } from "react";
import { StepCard } from "../components/StepCard";
import { ProofStatus } from "../components/ProofStatus";
import { TxStatus } from "../components/TxStatus";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { useProofGeneration } from "../hooks/useProofGeneration";
import {
  setupF5Trade,
  generateF5Proof,
  encryptedNoteBytes,
  type F5SetupResult,
} from "../lib/noteUtils";
import { toBytes32 } from "../lib/crypto";
import { addNote } from "../lib/noteStore";
import type { ProofResult } from "../lib/types";

type Step = "setup" | "register" | "configure" | "prove" | "trade" | "done";

export function F5GamingItemTradePage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("GamingItemTrade", signer);
  const proof = useProofGeneration();

  const [step, setStep] = useState<Step>("setup");
  const [itemIdInput, setItemIdInput] = useState("2001");
  const [itemTypeInput, setItemTypeInput] = useState("1");
  const [itemAttrInput, setItemAttrInput] = useState("100");
  const [gameIdInput, setGameIdInput] = useState("42");
  const [priceInput, setPriceInput] = useState("1000");
  const [isGift, setIsGift] = useState(false);
  const [setup, setSetup] = useState<F5SetupResult | null>(null);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  // Registration tx state
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Trade tx state
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [txConfirmed, setTxConfirmed] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Note states
  const [oldNoteState, setOldNoteState] = useState<string | null>(null);
  const [newNoteState, setNewNoteState] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-orange">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to use this demo.</p>
      </div>
    );
  }

  const stepStatus = (s: Step) => {
    const order: Step[] = ["setup", "register", "configure", "prove", "trade", "done"];
    const current = order.indexOf(step);
    const target = order.indexOf(s);
    if (target < current) return "complete" as const;
    if (target === current) return "active" as const;
    return "disabled" as const;
  };

  async function handleSetup() {
    setStep("register");
  }

  async function handleRegister() {
    if (!contract) return;

    const price = isGift ? 0n : BigInt(priceInput);
    const paymentToken = isGift ? 0n : 1n;
    const result = await setupF5Trade(
      BigInt(itemIdInput),
      BigInt(itemTypeInput),
      BigInt(itemAttrInput),
      BigInt(gameIdInput),
      price,
      paymentToken,
    );
    setSetup(result);

    setRegError(null);
    setRegPending(true);
    try {
      const tx = await contract.registerItem(
        toBytes32(result.oldItemHash),
        result.gameId,
        result.itemId,
        encryptedNoteBytes(),
      );
      setRegTxHash(tx.hash);
      await tx.wait();
      setRegConfirmed(true);
      setStep("configure");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegPending(false);
    }
  }

  function handleConfigure() {
    setStep("prove");
  }

  async function handleProve() {
    if (!setup) return;
    const result = await proof.generate(generateF5Proof, setup.circuitInputs);
    if (result) {
      setProofResult(result);
      setStep("trade");
    }
  }

  async function handleTrade() {
    if (!contract || !setup || !proofResult) return;
    setTxError(null);
    setTxPending(true);
    try {
      const { proof: p } = proofResult;
      const tx = await contract.tradeItem(
        p.a, p.b, p.c,
        toBytes32(setup.oldItemHash),
        toBytes32(setup.newItemHash),
        toBytes32(setup.paymentNoteHash),
        setup.gameId,
        toBytes32(setup.nullifier),
        encryptedNoteBytes(),
      );
      setTxHash(tx.hash);
      await tx.wait();
      setTxConfirmed(true);

      // Query note states
      const oldState = await contract.getNoteState(toBytes32(setup.oldItemHash));
      const newState = await contract.getNoteState(toBytes32(setup.newItemHash));
      const stateLabels = ["Invalid", "Valid", "Spent"];
      setOldNoteState(stateLabels[Number(oldState)]);
      setNewNoteState(stateLabels[Number(newState)]);

      // Save new item note to local storage
      addNote({
        hash: toBytes32(setup.newItemHash),
        contractName: "GamingItemTrade",
        type: "item",
        label: `Item #${setup.itemId.toString()} (Game ${setup.gameId.toString()})`,
        metadata: {
          itemId: setup.itemId.toString(),
          gameId: setup.gameId.toString(),
          mode: isGift ? "Gift" : `Paid (${priceInput})`,
          txHash: tx.hash,
        },
      });

      setStep("done");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-orange rounded neon-text-orange">
            TRADE
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-orange mb-1">
          F5: Gaming Item Trade
        </h1>
        <p className="text-sm font-body text-gray-500">
          Trade in-game items privately. Supports paid trades and free gifts,
          all verified with ZK proofs.
        </p>
      </div>

      {/* Step 1: Item Config */}
      <StepCard step={1} title="Configure Item" status={stepStatus("setup")} accentColor="orange">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Item ID</label>
              <input type="text" value={itemIdInput} onChange={(e) => setItemIdInput(e.target.value)} className="neon-input neon-input-orange w-full" />
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Item Type</label>
              <input type="text" value={itemTypeInput} onChange={(e) => setItemTypeInput(e.target.value)} className="neon-input neon-input-orange w-full" />
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Attributes</label>
              <input type="text" value={itemAttrInput} onChange={(e) => setItemAttrInput(e.target.value)} className="neon-input neon-input-orange w-full" />
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">Game ID</label>
              <input type="text" value={gameIdInput} onChange={(e) => setGameIdInput(e.target.value)} className="neon-input neon-input-orange w-full" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-body">
              <input
                type="checkbox"
                checked={isGift}
                onChange={(e) => setIsGift(e.target.checked)}
                className="accent-neon-orange"
              />
              <span className="text-sm text-gray-400">Gift (free transfer)</span>
            </label>
            {!isGift && (
              <div>
                <input type="text" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="Price" className="neon-input neon-input-orange w-32" />
              </div>
            )}
          </div>
          <button onClick={handleSetup} className="neon-btn neon-btn-orange">
            Continue
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register */}
      <StepCard step={2} title="Register Item" status={stepStatus("register")} accentColor="orange">
        <div className="space-y-3">
          <p className="text-sm text-gray-500 font-body">
            Generate seller/buyer keypairs and register the item on-chain.
          </p>
          <button onClick={handleRegister} disabled={regPending} className="neon-btn neon-btn-orange">
            {regPending ? "Registering..." : "Register Item On-Chain"}
          </button>
          <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          {setup && (
            <div className="text-xs space-y-1 glass-panel p-3">
              <p><span className="text-gray-600 font-display tracking-wider">SELLER</span> <span className="font-mono text-neon-orange/70 break-all">{setup.seller.pk.x.toString(16).slice(0, 16)}...</span></p>
              <p><span className="text-gray-600 font-display tracking-wider">BUYER</span> <span className="font-mono text-neon-orange/70 break-all">{setup.buyer.pk.x.toString(16).slice(0, 16)}...</span></p>
              <p><span className="text-gray-600 font-display tracking-wider">MODE</span> <span className="font-body text-gray-400">{isGift ? "Gift (free)" : `Paid (${priceInput})`}</span></p>
            </div>
          )}
        </div>
      </StepCard>

      {/* Step 3: Configure */}
      <StepCard step={3} title="Confirm Trade" status={stepStatus("configure")} accentColor="orange">
        <div className="space-y-3">
          <div className="text-xs glass-panel p-3 space-y-1">
            <p><span className="text-gray-600 font-display tracking-wider">TYPE</span> <span className="font-body text-gray-400">{isGift ? "Gift" : "Paid"}</span></p>
            {!isGift && <p><span className="text-gray-600 font-display tracking-wider">PAYMENT</span> <span className="font-mono text-neon-orange/70 break-all">{setup ? toBytes32(setup.paymentNoteHash).slice(0, 22) + "..." : ""}</span></p>}
          </div>
          <button onClick={handleConfigure} className="neon-btn neon-btn-orange">
            Confirm & Proceed to Proof
          </button>
        </div>
      </StepCard>

      {/* Step 4: Prove */}
      <StepCard step={4} title="Generate Trade Proof" status={stepStatus("prove")} accentColor="orange">
        <div className="space-y-3">
          <button onClick={handleProve} disabled={proof.isGenerating} className="neon-btn neon-btn-orange">
            {proof.isGenerating ? "Generating..." : "Generate ZK Proof"}
          </button>
          <ProofStatus isGenerating={proof.isGenerating} elapsed={proof.elapsed} error={proof.error} duration={proofResult?.duration} />
        </div>
      </StepCard>

      {/* Step 5: Execute Trade */}
      <StepCard step={5} title="Execute Trade" status={stepStatus("trade")} accentColor="orange">
        <div className="space-y-3">
          <button onClick={handleTrade} disabled={txPending} className="neon-btn neon-btn-orange">
            {txPending ? "Trading..." : "Execute Trade On-Chain"}
          </button>
          <TxStatus txHash={txHash} isPending={txPending} isConfirmed={txConfirmed} error={txError} />
        </div>
      </StepCard>

      {/* Result */}
      {step === "done" && setup && (
        <div className="glass-panel border neon-border-green p-5">
          <h3 className="font-display font-bold tracking-wider neon-text-green mb-3">TRADE COMPLETE</h3>
          <div className="text-sm space-y-2 font-body">
            <p>
              <span className="text-gray-500">Old Item Note:</span>{" "}
              <span className="font-mono text-xs text-gray-400">{toBytes32(setup.oldItemHash).slice(0, 22)}...</span>{" "}
              <span className={oldNoteState === "Spent" ? "neon-text-magenta" : "text-gray-500"}>({oldNoteState})</span>
            </p>
            <p>
              <span className="text-gray-500">New Item Note:</span>{" "}
              <span className="font-mono text-xs text-gray-400">{toBytes32(setup.newItemHash).slice(0, 22)}...</span>{" "}
              <span className={newNoteState === "Valid" ? "neon-text-green" : "text-gray-500"}>({newNoteState})</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
