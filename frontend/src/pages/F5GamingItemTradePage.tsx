import { useState, useEffect, useCallback, useRef } from "react";
import { StepCard } from "../components/StepCard";
import { ProofStatus } from "../components/ProofStatus";
import { TxStatus } from "../components/TxStatus";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { useProofGeneration } from "../hooks/useProofGeneration";
import {
  setupF5SellerItem,
  setupF5TradeWithBuyer,
  generateF5Proof,
  encryptedNoteBytes,
  type F5SellerSetupResult,
  type F5SetupResult,
} from "../lib/noteUtils";
import { generateKeypair } from "../lib/crypto";
import { toBytes32 } from "../lib/crypto";
import { addNote } from "../lib/noteStore";
import type { ProofResult, Keypair } from "../lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type OnChainListing = {
  seller: string;
  itemNoteHash: string;
  gameId: bigint;
  itemId: bigint;
  price: bigint;
  active: boolean;
  buyer: string;
  buyerPkX: bigint;
  buyerPkY: bigint;
};

type SellerStep = 1 | 2 | 3 | 4 | 5 | 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortHash(h: string) {
  return h.slice(0, 10) + "..." + h.slice(-6);
}

function formatPrice(wei: bigint) {
  return (Number(wei) / 1e18).toFixed(4) + " TON";
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ─── Main Component ───────────────────────────────────────────────────────────

export function F5GamingItemTradePage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("GamingItemTrade", signer);
  const tokenContract = useContract("MockERC20", signer);
  const proof = useProofGeneration();

  // Role selection
  const [role, setRole] = useState<"seller" | "buyer" | null>(null);

  // ── Seller state ──
  const [sellerStep, setSellerStep] = useState<SellerStep>(1);
  const [itemIdInput, setItemIdInput] = useState("2001");
  const [itemTypeInput, setItemTypeInput] = useState("1");
  const [itemAttrInput, setItemAttrInput] = useState("100");
  const [gameIdInput, setGameIdInput] = useState("42");
  const [priceInput, setPriceInput] = useState("10");

  const [sellerSetup, setSellerSetup] = useState<F5SellerSetupResult | null>(null);
  const [listingId, setListingId] = useState<number | null>(null);
  const [activeListing, setActiveListing] = useState<OnChainListing | null>(null);
  const [tradeSetup, setTradeSetup] = useState<F5SetupResult | null>(null);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  // Registration tx
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // List tx
  const [listTxHash, setListTxHash] = useState<string | null>(null);
  const [listPending, setListPending] = useState(false);
  const [listConfirmed, setListConfirmed] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Execute trade tx
  const [execTxHash, setExecTxHash] = useState<string | null>(null);
  const [execPending, setExecPending] = useState(false);
  const [execConfirmed, setExecConfirmed] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // ── Buyer state ──
  const [activeListings, setActiveListings] = useState<(OnChainListing & { id: number })[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [buyerKeypair, setBuyerKeypair] = useState<Keypair | null>(null);
  const [buyerListingsLoading, setBuyerListingsLoading] = useState(false);

  // Approve tx
  const [approveTxHash, setApproveTxHash] = useState<string | null>(null);
  const [approvePending, setApprovePending] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Purchase tx
  const [purchaseTxHash, setPurchaseTxHash] = useState<string | null>(null);
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch listings ────────────────────────────────────────────────────────

  const fetchListings = useCallback(async () => {
    if (!contract) return;
    try {
      const raw: OnChainListing[] = await contract.getListings();
      const indexed = raw
        .map((l, i) => ({ ...l, id: i + 1 }))
        .filter((l) => l.active);
      setActiveListings(indexed);
    } catch {
      // silent
    }
  }, [contract]);

  const fetchListing = useCallback(async (id: number) => {
    if (!contract) return;
    try {
      const l: OnChainListing = await contract.getListing(id);
      setActiveListing(l);
    } catch {
      // silent
    }
  }, [contract]);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!contract) return;

    if (role === "buyer") {
      setBuyerListingsLoading(true);
      fetchListings().finally(() => setBuyerListingsLoading(false));
      pollingRef.current = setInterval(fetchListings, 5000);
    }

    if (role === "seller" && sellerStep === 4 && listingId !== null) {
      pollingRef.current = setInterval(async () => {
        await fetchListing(listingId);
      }, 3000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [contract, role, sellerStep, listingId, fetchListings, fetchListing]);

  // Auto-advance when buyer is detected
  useEffect(() => {
    if (
      role === "seller" &&
      sellerStep === 4 &&
      activeListing &&
      activeListing.buyer !== ZERO_ADDR
    ) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setSellerStep(5);
    }
  }, [activeListing, role, sellerStep]);

  // ─────────────────────────────────────────────────────────────────────────
  // Seller Handlers
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSellerRegister() {
    if (!contract) return;
    const price = BigInt(Math.round(parseFloat(priceInput) * 1e18));
    const result = await setupF5SellerItem(
      BigInt(itemIdInput),
      BigInt(itemTypeInput),
      BigInt(itemAttrInput),
      BigInt(gameIdInput),
      price,
      1n,
    );
    setSellerSetup(result);

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
      setSellerStep(3);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegPending(false);
    }
  }

  async function handleListItem() {
    if (!contract || !sellerSetup) return;
    setListError(null);
    setListPending(true);
    try {
      const tx = await contract.listItem(
        toBytes32(sellerSetup.oldItemHash),
        sellerSetup.gameId,
        sellerSetup.itemId,
        sellerSetup.price,
      );
      setListTxHash(tx.hash);
      await tx.wait();
      setListConfirmed(true);

      // Read back the listing ID
      const nextId: bigint = await contract.nextListingId();
      const newListingId = Number(nextId) - 1;
      setListingId(newListingId);
      setSellerStep(4);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Listing failed");
    } finally {
      setListPending(false);
    }
  }

  async function handleGenerateProof() {
    if (!sellerSetup || !activeListing) return;
    const setup = await setupF5TradeWithBuyer(
      sellerSetup,
      activeListing.buyerPkX,
      activeListing.buyerPkY,
    );
    setTradeSetup(setup);

    const result = await proof.generate(generateF5Proof, setup.circuitInputs);
    if (result) {
      setProofResult(result);
      setSellerStep(6);
    }
  }

  async function handleExecuteTrade() {
    if (!contract || !tradeSetup || !proofResult || listingId === null) return;
    setExecError(null);
    setExecPending(true);
    try {
      const { proof: p } = proofResult;
      const tx = await contract.executeTradeForBuyer(
        listingId,
        p.a, p.b, p.c,
        toBytes32(tradeSetup.newItemHash),
        toBytes32(tradeSetup.paymentNoteHash),
        toBytes32(tradeSetup.nullifier),
        encryptedNoteBytes(),
      );
      setExecTxHash(tx.hash);
      await tx.wait();
      setExecConfirmed(true);

      addNote({
        hash: toBytes32(tradeSetup.oldItemHash),
        contractName: "GamingItemTrade",
        type: "item",
        label: `Item #${sellerSetup?.itemId.toString()} sold (Listing #${listingId})`,
        metadata: { txHash: tx.hash, role: "seller" },
      });
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setExecPending(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Buyer Handlers
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSelectListing(id: number) {
    setSelectedListingId(id);
    setPurchaseConfirmed(false);
    setPurchaseError(null);
    setApproveConfirmed(false);
    setApproveError(null);

    // Generate buyer ZK keypair locally
    const kp = await generateKeypair();
    setBuyerKeypair(kp);
  }

  async function handleApproveAndPurchase() {
    if (!contract || !tokenContract || !buyerKeypair || selectedListingId === null) return;
    const listing = activeListings.find((l) => l.id === selectedListingId);
    if (!listing) return;

    // Approve
    setApproveError(null);
    setApprovePending(true);
    try {
      const approveTx = await tokenContract.approve(
        await contract.getAddress(),
        listing.price,
      );
      setApproveTxHash(approveTx.hash);
      await approveTx.wait();
      setApproveConfirmed(true);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Approval failed");
      setApprovePending(false);
      return;
    } finally {
      setApprovePending(false);
    }

    // Purchase
    setPurchaseError(null);
    setPurchasePending(true);
    try {
      const purchaseTx = await contract.purchaseItem(
        selectedListingId,
        buyerKeypair.pk.x,
        buyerKeypair.pk.y,
      );
      setPurchaseTxHash(purchaseTx.hash);
      await purchaseTx.wait();
      setPurchaseConfirmed(true);

      addNote({
        hash: listing.itemNoteHash,
        contractName: "GamingItemTrade",
        type: "item",
        label: `Item #${listing.itemId.toString()} purchased (Listing #${selectedListingId})`,
        metadata: {
          listingId: String(selectedListingId),
          txHash: purchaseTx.hash,
          role: "buyer",
          buyerPkX: buyerKeypair.pk.x.toString(),
          buyerPkY: buyerKeypair.pk.y.toString(),
        },
      });

      // Refresh listings
      await fetchListings();
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setPurchasePending(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-orange">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to use this demo.</p>
      </div>
    );
  }

  // ── Role Selection ──
  if (!role) {
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
            P2P marketplace for privately trading in-game items via ZK proofs and ERC20 escrow.
          </p>
        </div>

        <div className="glass-panel border border-border-dim p-6 space-y-4">
          <p className="font-display text-sm tracking-wider text-gray-400">SELECT YOUR ROLE</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setRole("seller")}
              className="glass-panel border border-neon-orange/40 p-5 text-left hover:border-neon-orange transition-colors group"
            >
              <p className="font-display text-base tracking-wider neon-text-orange mb-1">SELLER</p>
              <p className="text-xs font-body text-gray-500 group-hover:text-gray-400">
                Register an item, list it for sale, and execute the ZK trade after a buyer pays.
              </p>
            </button>
            <button
              onClick={() => setRole("buyer")}
              className="glass-panel border border-neon-cyan/40 p-5 text-left hover:border-neon-cyan transition-colors group"
            >
              <p className="font-display text-base tracking-wider neon-text-cyan mb-1">BUYER</p>
              <p className="text-xs font-body text-gray-500 group-hover:text-gray-400">
                Browse active listings, pay with TON, and submit your ZK pubkey to receive the item.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Seller Panel ──
  if (role === "seller") {
    const stepStatus = (s: SellerStep) => {
      if (s < sellerStep) return "complete" as const;
      if (s === sellerStep) return "active" as const;
      return "disabled" as const;
    };

    return (
      <div className="max-w-2xl mx-auto space-y-6 stagger-in">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-orange rounded neon-text-orange">
                SELLER
              </span>
            </div>
            <button
              onClick={() => setRole(null)}
              className="text-xs text-gray-600 hover:text-gray-400 font-display tracking-wider"
            >
              ← SWITCH ROLE
            </button>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-wider neon-text-orange mb-1">
            F5: Gaming Item Trade
          </h1>
          <p className="text-sm font-body text-gray-500">
            List your item → wait for a buyer → generate ZK proof → complete trade.
          </p>
        </div>

        {/* Step 1: Configure Item */}
        <StepCard step={1} title="Configure Item" status={stepStatus(1)} accentColor="orange">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Item ID", itemIdInput, setItemIdInput],
                ["Item Type", itemTypeInput, setItemTypeInput],
                ["Attributes", itemAttrInput, setItemAttrInput],
                ["Game ID", gameIdInput, setGameIdInput],
              ].map(([label, value, setter]) => (
                <div key={label as string}>
                  <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">
                    {label as string}
                  </label>
                  <input
                    type="text"
                    value={value as string}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                    className="neon-input neon-input-orange w-full"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-display tracking-wider text-gray-500 block mb-1">
                Price (TON)
              </label>
              <input
                type="text"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="neon-input neon-input-orange w-40"
              />
            </div>
            <button onClick={() => setSellerStep(2)} className="neon-btn neon-btn-orange">
              Continue
            </button>
          </div>
        </StepCard>

        {/* Step 2: Register Item */}
        <StepCard step={2} title="Register Item On-Chain" status={stepStatus(2)} accentColor="orange">
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-body">
              Generate your seller ZK keypair and register the item note on-chain.
            </p>
            {sellerStep === 2 && (
              <div className="text-xs glass-panel p-3 space-y-1">
                <p><span className="text-gray-600 font-display tracking-wider">ITEM ID</span> <span className="font-mono text-neon-orange/70">{itemIdInput}</span></p>
                <p><span className="text-gray-600 font-display tracking-wider">GAME</span> <span className="font-mono text-neon-orange/70">{gameIdInput}</span></p>
                <p><span className="text-gray-600 font-display tracking-wider">PRICE</span> <span className="font-mono text-neon-orange/70">{priceInput} TON</span></p>
              </div>
            )}
            <button onClick={handleSellerRegister} disabled={regPending} className="neon-btn neon-btn-orange">
              {regPending ? "Registering..." : "Register Item"}
            </button>
            <TxStatus txHash={regTxHash} isPending={regPending} isConfirmed={regConfirmed} error={regError} />
            {sellerSetup && (
              <div className="text-xs glass-panel p-3 space-y-1">
                <p><span className="text-gray-600 font-display tracking-wider">SELLER PK</span> <span className="font-mono text-neon-orange/70">{sellerSetup.seller.pk.x.toString(16).slice(0, 20)}...</span></p>
                <p><span className="text-gray-600 font-display tracking-wider">NOTE HASH</span> <span className="font-mono text-neon-orange/70">{shortHash(toBytes32(sellerSetup.oldItemHash))}</span></p>
              </div>
            )}
          </div>
        </StepCard>

        {/* Step 3: List for Sale */}
        <StepCard step={3} title="List for Sale" status={stepStatus(3)} accentColor="orange">
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-body">
              List the registered item on the marketplace. Buyers will see it and can purchase.
            </p>
            <button onClick={handleListItem} disabled={listPending} className="neon-btn neon-btn-orange">
              {listPending ? "Listing..." : "Create Listing"}
            </button>
            <TxStatus txHash={listTxHash} isPending={listPending} isConfirmed={listConfirmed} error={listError} />
          </div>
        </StepCard>

        {/* Step 4: Waiting for Buyer */}
        <StepCard step={4} title="Waiting for Buyer" status={stepStatus(4)} accentColor="orange">
          <div className="space-y-3">
            {sellerStep === 4 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-neon-orange animate-pulse" />
                  <p className="text-sm text-gray-500 font-body">
                    Polling for buyer... (Listing #{listingId})
                  </p>
                </div>
                {activeListing && activeListing.buyer === ZERO_ADDR && (
                  <p className="text-xs text-gray-600 font-body">No buyer yet. Share Listing #{listingId} with a buyer.</p>
                )}
              </>
            )}
            {sellerStep > 4 && activeListing && activeListing.buyer !== ZERO_ADDR && (
              <div className="text-xs glass-panel p-3 space-y-1">
                <p className="neon-text-green font-display tracking-wider text-xs">BUYER FOUND</p>
                <p><span className="text-gray-600 font-display tracking-wider">BUYER</span> <span className="font-mono text-gray-400">{activeListing.buyer.slice(0, 10)}...</span></p>
                <p><span className="text-gray-600 font-display tracking-wider">BUYER PK X</span> <span className="font-mono text-neon-orange/70">{activeListing.buyerPkX.toString(16).slice(0, 20)}...</span></p>
              </div>
            )}
          </div>
        </StepCard>

        {/* Step 5: Generate ZK Proof */}
        <StepCard step={5} title="Generate ZK Proof" status={stepStatus(5)} accentColor="orange">
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-body">
              Use buyer's ZK pubkey from the listing to generate the ownership transfer proof.
            </p>
            <button
              onClick={handleGenerateProof}
              disabled={proof.isGenerating || sellerStep !== 5}
              className="neon-btn neon-btn-orange"
            >
              {proof.isGenerating ? "Generating..." : "Generate ZK Proof"}
            </button>
            <ProofStatus
              isGenerating={proof.isGenerating}
              elapsed={proof.elapsed}
              error={proof.error}
              duration={proofResult?.duration}
            />
          </div>
        </StepCard>

        {/* Step 6: Execute Trade */}
        <StepCard step={6} title="Execute Trade" status={stepStatus(6)} accentColor="orange">
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-body">
              Submit the ZK proof on-chain. The old item note is spent, a new one is created for the buyer, and payment is released to you.
            </p>
            <button
              onClick={handleExecuteTrade}
              disabled={execPending || sellerStep !== 6}
              className="neon-btn neon-btn-orange"
            >
              {execPending ? "Executing..." : "Execute Trade"}
            </button>
            <TxStatus txHash={execTxHash} isPending={execPending} isConfirmed={execConfirmed} error={execError} />
          </div>
        </StepCard>

        {/* Done */}
        {execConfirmed && tradeSetup && (
          <div className="glass-panel border neon-border-green p-5">
            <h3 className="font-display font-bold tracking-wider neon-text-green mb-3">TRADE COMPLETE</h3>
            <div className="text-sm space-y-2 font-body">
              <p>
                <span className="text-gray-500">Old Note:</span>{" "}
                <span className="font-mono text-xs text-gray-400">{shortHash(toBytes32(tradeSetup.oldItemHash))}</span>{" "}
                <span className="neon-text-magenta">(Spent)</span>
              </p>
              <p>
                <span className="text-gray-500">New Note (buyer):</span>{" "}
                <span className="font-mono text-xs text-gray-400">{shortHash(toBytes32(tradeSetup.newItemHash))}</span>{" "}
                <span className="neon-text-green">(Valid)</span>
              </p>
              <p>
                <span className="text-gray-500">Payment released:</span>{" "}
                <span className="font-mono text-neon-orange/70">{priceInput} TON</span>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Buyer Panel ──
  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-in">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-cyan rounded neon-text-cyan">
              BUYER
            </span>
          </div>
          <button
            onClick={() => setRole(null)}
            className="text-xs text-gray-600 hover:text-gray-400 font-display tracking-wider"
          >
            ← SWITCH ROLE
          </button>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-cyan mb-1">
          F5: Gaming Item Trade
        </h1>
        <p className="text-sm font-body text-gray-500">
          Browse active listings, pay with TON, and submit your ZK pubkey to receive the item.
        </p>
      </div>

      {/* Active Listings */}
      <div className="glass-panel border border-border-dim p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm tracking-wider text-gray-400">ACTIVE LISTINGS</p>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
            <span className="text-xs text-gray-600 font-body">Auto-refreshing</span>
          </div>
        </div>

        {buyerListingsLoading && activeListings.length === 0 ? (
          <p className="text-xs text-gray-600 font-body">Loading listings...</p>
        ) : activeListings.length === 0 ? (
          <p className="text-xs text-gray-600 font-body">No active listings. Ask a seller to create one.</p>
        ) : (
          <div className="space-y-2">
            {activeListings.map((listing) => (
              <button
                key={listing.id}
                onClick={() => handleSelectListing(listing.id)}
                className={`w-full text-left glass-panel p-3 border transition-colors ${
                  selectedListingId === listing.id
                    ? "border-neon-cyan/60"
                    : "border-border-dim hover:border-neon-cyan/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-display tracking-wider text-gray-300">
                      Listing #{listing.id} — Item #{listing.itemId.toString()}
                    </p>
                    <p className="text-xs font-body text-gray-500">
                      Game {listing.gameId.toString()} · Seller: {listing.seller.slice(0, 8)}...
                    </p>
                  </div>
                  <span className="font-mono text-sm neon-text-cyan">
                    {formatPrice(listing.price)}
                  </span>
                </div>
                {listing.buyer !== ZERO_ADDR && (
                  <p className="text-xs text-yellow-500/70 font-body mt-1">Already purchased — awaiting ZK proof</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Panel */}
      {selectedListingId !== null && !purchaseConfirmed && (
        <div className="glass-panel border border-neon-cyan/40 p-5 space-y-4">
          <p className="font-display text-sm tracking-wider neon-text-cyan">
            PURCHASE LISTING #{selectedListingId}
          </p>

          {buyerKeypair && (
            <div className="text-xs glass-panel p-3 space-y-1">
              <p className="text-gray-600 font-display tracking-wider mb-1">YOUR ZK KEYPAIR (LOCAL ONLY)</p>
              <p><span className="text-gray-600">PK X:</span> <span className="font-mono text-neon-cyan/70">{buyerKeypair.pk.x.toString(16).slice(0, 24)}...</span></p>
              <p><span className="text-gray-600">PK Y:</span> <span className="font-mono text-neon-cyan/70">{buyerKeypair.pk.y.toString(16).slice(0, 24)}...</span></p>
              <p className="text-gray-600 mt-1 font-body">
                Your secret key is kept in memory only. The seller will use your public key to create the new item note.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-display tracking-wider text-gray-500">STEP 1: APPROVE TOKEN</p>
            <TxStatus txHash={approveTxHash} isPending={approvePending} isConfirmed={approveConfirmed} error={approveError} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-display tracking-wider text-gray-500">STEP 2: PURCHASE</p>
            <TxStatus txHash={purchaseTxHash} isPending={purchasePending} isConfirmed={purchaseConfirmed} error={purchaseError} />
          </div>

          <button
            onClick={handleApproveAndPurchase}
            disabled={approvePending || purchasePending}
            className="neon-btn neon-btn-cyan"
          >
            {approvePending ? "Approving..." : purchasePending ? "Purchasing..." : "Approve TON + Purchase"}
          </button>
        </div>
      )}

      {/* Purchase Success */}
      {purchaseConfirmed && (
        <div className="glass-panel border neon-border-green p-5">
          <h3 className="font-display font-bold tracking-wider neon-text-green mb-2">PAYMENT SENT</h3>
          <p className="text-sm font-body text-gray-500">
            Your TON has been placed in escrow and your ZK pubkey submitted. The seller will now generate the ZK proof and complete the trade. Once done, the item note will be transferred to your key.
          </p>
          {buyerKeypair && (
            <div className="text-xs glass-panel p-3 mt-3 space-y-1">
              <p className="text-gray-600 font-display tracking-wider">SAVE YOUR SECRET KEY</p>
              <p className="font-mono text-yellow-400/70 break-all">{buyerKeypair.sk.toString(16)}</p>
              <p className="text-gray-600 font-body">You will need this to prove ownership of the received item.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
