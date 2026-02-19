import { useState } from "react";
import { StepCard } from "../components/StepCard";
import { ProofStatus } from "../components/ProofStatus";
import { TxStatus } from "../components/TxStatus";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { useProofGeneration } from "../hooks/useProofGeneration";
import {
  setupF1Transfer,
  generateF1Proof,
  encryptedNoteBytes,
  type F1SetupResult,
} from "../lib/noteUtils";
import { toBytes32 } from "../lib/crypto";
import { addNote } from "../lib/noteStore";
import type { ProofResult } from "../lib/types";

type Step = "setup" | "register" | "prove" | "transfer" | "done";

export function F1PrivateNFTPage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("PrivateNFT", signer);
  const proof = useProofGeneration();

  const [step, setStep] = useState<Step>("setup");
  const [nftIdInput, setNftIdInput] = useState("1001");
  const [collectionInput, setCollectionInput] = useState("12345");
  const [setup, setSetup] = useState<F1SetupResult | null>(null);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  // Registration tx state
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Transfer tx state
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
        <p className="font-display text-sm tracking-wider neon-text-cyan">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to use this demo.</p>
      </div>
    );
  }

  const stepStatus = (s: Step) => {
    const order: Step[] = ["setup", "register", "prove", "transfer", "done"];
    const current = order.indexOf(step);
    const target = order.indexOf(s);
    if (target < current) return "complete" as const;
    if (target === current) return "active" as const;
    return "disabled" as const;
  };

  async function handleSetup() {
    const nftId = BigInt(nftIdInput);
    const collection = BigInt(collectionInput);
    const result = await setupF1Transfer(nftId, collection);
    setSetup(result);
    setStep("register");
  }

  async function handleRegister() {
    if (!contract || !setup) return;
    setRegError(null);
    setRegPending(true);
    try {
      const tx = await contract.registerNFT(
        toBytes32(setup.oldNftHash),
        "0x" + setup.collectionAddress.toString(16).padStart(40, "0"),
        setup.nftId,
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
    const result = await proof.generate(generateF1Proof, setup.circuitInputs);
    if (result) {
      setProofResult(result);
      setStep("transfer");
    }
  }

  async function handleTransfer() {
    if (!contract || !setup || !proofResult) return;
    setTxError(null);
    setTxPending(true);
    try {
      const { proof: p } = proofResult;
      const tx = await contract.transferNFT(
        p.a, p.b, p.c,
        toBytes32(setup.oldNftHash),
        toBytes32(setup.newNftHash),
        setup.nftId,
        "0x" + setup.collectionAddress.toString(16).padStart(40, "0"),
        toBytes32(setup.nullifier),
        encryptedNoteBytes(),
      );
      setTxHash(tx.hash);
      await tx.wait();
      setTxConfirmed(true);

      // Query note states
      const oldState = await contract.getNoteState(toBytes32(setup.oldNftHash));
      const newState = await contract.getNoteState(toBytes32(setup.newNftHash));
      const stateLabels = ["Invalid", "Valid", "Spent"];
      setOldNoteState(stateLabels[Number(oldState)]);
      setNewNoteState(stateLabels[Number(newState)]);

      // Save new note to local storage
      addNote({
        hash: toBytes32(setup.newNftHash),
        contractName: "PrivateNFT",
        type: "nft",
        label: `NFT #${setup.nftId.toString()}`,
        metadata: {
          nftId: setup.nftId.toString(),
          collection: setup.collectionAddress.toString(),
          txHash: tx.hash,
        },
      });

      setStep("done");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-cyan rounded neon-text-cyan">
            STEALTH
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-cyan mb-1">
          F1: Private NFT Transfer
        </h1>
        <p className="text-sm font-body text-gray-500">
          Transfer NFT ownership privately. A ZK proof verifies the old owner
          knows the secret key without revealing it.
        </p>
      </div>

      {/* Step 1: Setup */}
      <StepCard step={1} title="Setup Keypairs" status={stepStatus("setup")} accentColor="cyan">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">NFT ID</label>
            <input
              type="text"
              value={nftIdInput}
              onChange={(e) => setNftIdInput(e.target.value)}
              className="neon-input w-full"
            />
          </div>
          <div>
            <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">
              Collection Address (numeric)
            </label>
            <input
              type="text"
              value={collectionInput}
              onChange={(e) => setCollectionInput(e.target.value)}
              className="neon-input w-full"
            />
          </div>
          <button onClick={handleSetup} className="neon-btn neon-btn-cyan">
            Generate Keypairs
          </button>
        </div>
      </StepCard>

      {/* Step 2: Register */}
      <StepCard step={2} title="Register NFT" status={stepStatus("register")} accentColor="cyan">
        {setup && (
          <div className="space-y-3">
            <div className="text-xs space-y-1 glass-panel p-3">
              <p><span className="text-gray-600 font-display tracking-wider">OWNER_A</span> <span className="font-mono text-neon-cyan/70 break-all">{setup.oldOwner.pk.x.toString(16).slice(0, 16)}...</span></p>
              <p><span className="text-gray-600 font-display tracking-wider">OWNER_B</span> <span className="font-mono text-neon-cyan/70 break-all">{setup.newOwner.pk.x.toString(16).slice(0, 16)}...</span></p>
              <p><span className="text-gray-600 font-display tracking-wider">HASH</span> <span className="font-mono text-neon-cyan/70 break-all">{toBytes32(setup.oldNftHash).slice(0, 22)}...</span></p>
            </div>
            <button onClick={handleRegister} disabled={regPending} className="neon-btn neon-btn-cyan">
              {regPending ? "Registering..." : "Register NFT On-Chain"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
          </div>
        )}
      </StepCard>

      {/* Step 3: Generate Proof */}
      <StepCard step={3} title="Generate Transfer Proof" status={stepStatus("prove")} accentColor="cyan">
        <div className="space-y-3">
          <p className="text-sm text-gray-500 font-body">
            The ZK circuit proves Owner A knows the secret key for the old note
            and correctly computes the new note for Owner B.
          </p>
          <button onClick={handleProve} disabled={proof.isGenerating} className="neon-btn neon-btn-cyan">
            {proof.isGenerating ? "Generating..." : "Generate ZK Proof"}
          </button>
          <ProofStatus isGenerating={proof.isGenerating} elapsed={proof.elapsed} error={proof.error} duration={proofResult?.duration} />
        </div>
      </StepCard>

      {/* Step 4: Submit Transfer */}
      <StepCard step={4} title="Submit Transfer" status={stepStatus("transfer")} accentColor="cyan">
        <div className="space-y-3">
          <button onClick={handleTransfer} disabled={txPending} className="neon-btn neon-btn-cyan">
            {txPending ? "Submitting..." : "Transfer NFT On-Chain"}
          </button>
          <TxStatus txHash={txHash} isPending={txPending} isConfirmed={txConfirmed} error={txError} />
        </div>
      </StepCard>

      {/* Result */}
      {step === "done" && setup && (
        <div className="glass-panel border neon-border-green p-5">
          <h3 className="font-display font-bold tracking-wider neon-text-green mb-3">TRANSFER COMPLETE</h3>
          <div className="text-sm space-y-2 font-body">
            <p>
              <span className="text-gray-500">Old Note:</span>{" "}
              <span className="font-mono text-xs text-gray-400">{toBytes32(setup.oldNftHash).slice(0, 22)}...</span>{" "}
              <span className={oldNoteState === "Spent" ? "neon-text-magenta" : "text-gray-500"}>({oldNoteState})</span>
            </p>
            <p>
              <span className="text-gray-500">New Note:</span>{" "}
              <span className="font-mono text-xs text-gray-400">{toBytes32(setup.newNftHash).slice(0, 22)}...</span>{" "}
              <span className={newNoteState === "Valid" ? "neon-text-green" : "text-gray-500"}>({newNoteState})</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
