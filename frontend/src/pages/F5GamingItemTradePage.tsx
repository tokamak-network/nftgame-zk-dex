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

type SellerTab = "create" | "mylistings";
type SellerStep = 1 | 2 | 3 | 4 | 5 | 6;

// ─── Constants ────────────────────────────────────────────────────────────────

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const SETUPS_STORAGE_KEY = "f5_seller_setups_v1";

// ─── Helpers (outside component) ─────────────────────────────────────────────

function shortHash(h: string) {
  return h.slice(0, 10) + "..." + h.slice(-6);
}

function formatPrice(wei: bigint) {
  return (Number(wei) / 1e18).toFixed(4) + " TON";
}

// ethers v6 Result objects lose named properties when spread.
// Explicitly map each field to a plain object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListing(l: any, id: number): OnChainListing & { id: number } {
  return {
    id,
    seller: l.seller as string,
    itemNoteHash: l.itemNoteHash as string,
    gameId: l.gameId as bigint,
    itemId: l.itemId as bigint,
    price: l.price as bigint,
    active: l.active as boolean,
    buyer: l.buyer as string,
    buyerPkX: l.buyerPkX as bigint,
    buyerPkY: l.buyerPkY as bigint,
  };
}

// ─── localStorage persistence for seller setups ───────────────────────────────

function saveSetupToStorage(listingId: number, setup: F5SellerSetupResult): void {
  try {
    const stored = localStorage.getItem(SETUPS_STORAGE_KEY);
    const all: Record<string, unknown> = stored ? JSON.parse(stored) : {};
    all[String(listingId)] = {
      seller: {
        sk: setup.seller.sk.toString(),
        pk: { x: setup.seller.pk.x.toString(), y: setup.seller.pk.y.toString() },
      },
      oldItemHash: setup.oldItemHash.toString(),
      oldSalt: setup.oldSalt.toString(),
      gameId: setup.gameId.toString(),
      itemId: setup.itemId.toString(),
      itemType: setup.itemType.toString(),
      itemAttributes: setup.itemAttributes.toString(),
      price: setup.price.toString(),
      paymentToken: setup.paymentToken.toString(),
    };
    localStorage.setItem(SETUPS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable
  }
}

function loadSetupFromStorage(listingId: number): F5SellerSetupResult | null {
  try {
    const stored = localStorage.getItem(SETUPS_STORAGE_KEY);
    if (!stored) return null;
    const all = JSON.parse(stored);
    const raw = all[String(listingId)];
    if (!raw) return null;
    return {
      seller: {
        sk: BigInt(raw.seller.sk),
        pk: { x: BigInt(raw.seller.pk.x), y: BigInt(raw.seller.pk.y) },
      },
      oldItemHash: BigInt(raw.oldItemHash),
      oldSalt: BigInt(raw.oldSalt),
      gameId: BigInt(raw.gameId),
      itemId: BigInt(raw.itemId),
      itemType: BigInt(raw.itemType),
      itemAttributes: BigInt(raw.itemAttributes),
      price: BigInt(raw.price),
      paymentToken: BigInt(raw.paymentToken),
    };
  } catch {
    return null;
  }
}

function hasSavedSetups(): boolean {
  try {
    const stored = localStorage.getItem(SETUPS_STORAGE_KEY);
    if (!stored) return false;
    return Object.keys(JSON.parse(stored)).length > 0;
  } catch {
    return false;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function F5GamingItemTradePage() {
  const { signer, isConnected } = useWallet();
  const contract = useContract("GamingItemTrade", signer);
  const tokenContract = useContract("MockERC20", signer);
  const proof = useProofGeneration();

  // Role selection
  const [role, setRole] = useState<"seller" | "buyer" | null>(null);

  // ── Seller state ──
  // Default to "mylistings" tab if previous sessions exist
  const [sellerTab, setSellerTab] = useState<SellerTab>(() =>
    hasSavedSetups() ? "mylistings" : "create"
  );
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

  // My Listings state
  const [myListings, setMyListings] = useState<(OnChainListing & { id: number; hasSetup: boolean })[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Cancel listing tx (keyed by listingId)
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  const [approveTxHash, setApproveTxHash] = useState<string | null>(null);
  const [approvePending, setApprovePending] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [purchaseTxHash, setPurchaseTxHash] = useState<string | null>(null);
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ───────────────────────────────────────────────────────

  const fetchListings = useCallback(async () => {
    if (!contract) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = await contract.getListings();
      const indexed = raw
        .map((l, i) => parseListing(l, i + 1))
        .filter((l) => l.active);
      setActiveListings(indexed);
    } catch (e) {
      console.error("fetchListings error:", e);
    }
  }, [contract]);

  const fetchListing = useCallback(async (id: number) => {
    if (!contract) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l: any = await contract.getListing(id);
      setActiveListing(parseListing(l, id));
    } catch (e) {
      console.error("fetchListing error:", e);
    }
  }, [contract]);

  const fetchMyListings = useCallback(async () => {
    if (!contract || !signer) return;
    setMyListingsLoading(true);
    try {
      const myAddr = signer.address.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = await contract.getListings();
      const mine = raw
        .map((l, i) => parseListing(l, i + 1))
        .filter((l) => l.seller.toLowerCase() === myAddr)
        .map((l) => ({ ...l, hasSetup: loadSetupFromStorage(l.id) !== null }));
      setMyListings(mine);
    } catch (e) {
      console.error("fetchMyListings error:", e);
    } finally {
      setMyListingsLoading(false);
    }
  }, [contract, signer]);

  // ── Polling & effects ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!contract) return;
    if (pollingRef.current) clearInterval(pollingRef.current);

    if (role === "buyer") {
      setBuyerListingsLoading(true);
      fetchListings().finally(() => setBuyerListingsLoading(false));
      pollingRef.current = setInterval(fetchListings, 5000);
    } else if (role === "seller" && sellerTab === "mylistings") {
      fetchMyListings();
      pollingRef.current = setInterval(fetchMyListings, 5000);
    } else if (role === "seller" && sellerTab === "create" && sellerStep === 4 && listingId !== null) {
      pollingRef.current = setInterval(() => fetchListing(listingId), 3000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [contract, role, sellerTab, sellerStep, listingId, fetchListings, fetchListing, fetchMyListings]);

  // Auto-advance to step 5 when buyer is detected in step 4
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

      const nextId: bigint = await contract.nextListingId();
      const newListingId = Number(nextId) - 1;
      setListingId(newListingId);

      // Persist seller setup so it can be resumed after navigation
      saveSetupToStorage(newListingId, sellerSetup);

      setSellerStep(4);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Listing failed");
    } finally {
      setListPending(false);
    }
  }

  async function handleResumeListing(listing: OnChainListing & { id: number }) {
    setResumeError(null);
    const setup = loadSetupFromStorage(listing.id);
    if (!setup) {
      setResumeError(`Listing #${listing.id}: ZK setup not found in local storage. Clear your browser data may have removed it.`);
      return;
    }
    if (!listing.active) {
      setResumeError(`Listing #${listing.id} is no longer active.`);
      return;
    }

    // Restore state for the create flow
    setSellerSetup(setup);
    setListingId(listing.id);
    setActiveListing(listing);
    setTradeSetup(null);
    setProofResult(null);
    setExecTxHash(null);
    setExecConfirmed(false);
    setExecError(null);

    // Mark earlier steps as complete
    setRegConfirmed(true);
    setListConfirmed(true);
    setItemIdInput(setup.itemId.toString());
    setGameIdInput(setup.gameId.toString());
    setPriceInput((Number(setup.price) / 1e18).toString());

    setSellerStep(listing.buyer !== ZERO_ADDR ? 5 : 4);
    setSellerTab("create");
  }

  async function handleCancelListing(listingId: number) {
    if (!contract) return;
    setCancelError(null);
    setCancellingId(listingId);
    try {
      const tx = await contract.cancelListing(listingId);
      await tx.wait();
      await fetchMyListings();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingId(null);
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
    const kp = await generateKeypair();
    setBuyerKeypair(kp);
  }

  async function handleApproveAndPurchase() {
    if (!contract || !tokenContract || !buyerKeypair || selectedListingId === null) return;
    const listing = activeListings.find((l) => l.id === selectedListingId);
    if (!listing) return;

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

      await fetchListings();
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setPurchasePending(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function ListingStatusBadge({ listing }: { listing: OnChainListing }) {
    if (!listing.active) {
      return <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 rounded border border-gray-700 text-gray-600">CLOSED</span>;
    }
    if (listing.buyer === ZERO_ADDR) {
      return (
        <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 rounded border border-neon-orange/40 neon-text-orange flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-orange animate-pulse inline-block" />
          WAITING
        </span>
      );
    }
    return (
      <span className="text-[10px] font-display tracking-wider px-1.5 py-0.5 rounded border border-green-500/40 text-green-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
        BUYER READY
      </span>
    );
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
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-orange rounded neon-text-orange">
              SELLER
            </span>
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 glass-panel border border-border-dim p-1 rounded">
          <button
            onClick={() => setSellerTab("create")}
            className={`flex-1 py-2 px-4 text-xs font-display tracking-wider rounded transition-colors ${
              sellerTab === "create"
                ? "bg-neon-orange/20 neon-text-orange border border-neon-orange/40"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            + NEW LISTING
          </button>
          <button
            onClick={() => { setSellerTab("mylistings"); setResumeError(null); }}
            className={`flex-1 py-2 px-4 text-xs font-display tracking-wider rounded transition-colors ${
              sellerTab === "mylistings"
                ? "bg-neon-orange/20 neon-text-orange border border-neon-orange/40"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            MY LISTINGS {myListings.length > 0 && `(${myListings.length})`}
          </button>
        </div>

        {/* ── MY LISTINGS tab ── */}
        {sellerTab === "mylistings" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-body text-gray-500">
                Your on-chain listings. Resume a trade where you left off.
              </p>
              <button
                onClick={fetchMyListings}
                disabled={myListingsLoading}
                className="text-xs font-display tracking-wider text-gray-500 hover:neon-text-orange transition-colors"
              >
                {myListingsLoading ? "Loading..." : "↻ Refresh"}
              </button>
            </div>

            {(resumeError || cancelError) && (
              <div className="glass-panel border border-red-500/40 p-3">
                <p className="text-xs text-red-400 font-body">{resumeError ?? cancelError}</p>
              </div>
            )}

            {myListingsLoading && myListings.length === 0 ? (
              <div className="glass-panel border border-border-dim p-6 text-center">
                <p className="text-xs text-gray-600 font-body">Loading your listings...</p>
              </div>
            ) : myListings.length === 0 ? (
              <div className="glass-panel border border-border-dim p-6 text-center space-y-2">
                <p className="text-sm text-gray-500 font-body">No listings found for your wallet.</p>
                <button
                  onClick={() => setSellerTab("create")}
                  className="neon-btn neon-btn-orange text-xs"
                >
                  + Create New Listing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myListings.map((listing) => (
                  <div
                    key={listing.id}
                    className={`glass-panel p-4 border ${
                      listing.active && listing.buyer !== ZERO_ADDR
                        ? "border-green-500/30"
                        : listing.active
                        ? "border-neon-orange/30"
                        : "border-border-dim opacity-60"
                    }`}
                  >
                    {/* Listing header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-display text-sm tracking-wider text-gray-200">
                          Listing #{listing.id}
                        </p>
                        <p className="text-xs font-body text-gray-500 mt-0.5">
                          Item #{listing.itemId.toString()} · Game {listing.gameId.toString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <ListingStatusBadge listing={listing} />
                        <span className="font-mono text-xs neon-text-orange">
                          {formatPrice(listing.price)}
                        </span>
                      </div>
                    </div>

                    {/* Note hash */}
                    <p className="text-[10px] font-mono text-gray-600 mb-3">
                      Note: {shortHash(listing.itemNoteHash)}
                    </p>

                    {/* Buyer info if found */}
                    {listing.buyer !== ZERO_ADDR && (
                      <div className="glass-panel p-2 mb-3 space-y-1">
                        <p className="text-[10px] text-green-400 font-display tracking-wider">BUYER PAID — AWAITING ZK PROOF</p>
                        <p className="text-[10px] font-mono text-gray-500">
                          Buyer: {listing.buyer.slice(0, 10)}...{listing.buyer.slice(-6)}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {listing.active && listing.buyer !== ZERO_ADDR && (
                      <div className="space-y-2">
                        {listing.hasSetup ? (
                          <button
                            onClick={() => handleResumeListing(listing)}
                            className="neon-btn neon-btn-orange w-full text-xs"
                          >
                            Resume Trade → Generate ZK Proof
                          </button>
                        ) : (
                          <div className="glass-panel border border-yellow-500/30 p-2 space-y-1">
                            <p className="text-[10px] text-yellow-500/70 font-body">
                              ⚠️ ZK private key not found in local storage (created in a different session).
                              Cannot generate proof. Cancel to refund the buyer.
                            </p>
                          </div>
                        )}
                        {/* Cancel is always available for active listings */}
                        <button
                          onClick={() => handleCancelListing(listing.id)}
                          disabled={cancellingId === listing.id}
                          className="w-full py-1.5 px-3 text-[10px] font-display tracking-wider border border-red-500/40 text-red-400/70 hover:border-red-500/70 hover:text-red-400 transition-colors rounded"
                        >
                          {cancellingId === listing.id ? "Cancelling..." : "Cancel Listing (Refund Buyer)"}
                        </button>
                      </div>
                    )}
                    {listing.active && listing.buyer === ZERO_ADDR && (
                      <div className="flex items-center justify-between">
                        {listing.hasSetup ? (
                          <button
                            onClick={() => handleResumeListing(listing)}
                            className="text-xs font-display tracking-wider text-gray-500 hover:neon-text-orange transition-colors"
                          >
                            Resume (step 4 — waiting for buyer)
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-600 font-body">Waiting for buyer</span>
                        )}
                        <button
                          onClick={() => handleCancelListing(listing.id)}
                          disabled={cancellingId === listing.id}
                          className="text-[10px] font-display tracking-wider text-red-400/50 hover:text-red-400/80 transition-colors"
                        >
                          {cancellingId === listing.id ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    )}
                    {!listing.active && (
                      <p className="text-[10px] text-gray-600 font-body">This listing has been completed or cancelled.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NEW LISTING / RESUME create tab ── */}
        {sellerTab === "create" && (
          <div className="space-y-6">
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
                {listConfirmed && listingId !== null && (
                  <p className="text-xs font-body text-gray-500">
                    Listing #{listingId} created. Setup saved to local storage for resume.
                  </p>
                )}
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
                    <p className="text-xs text-gray-600 font-body">
                      Share Listing #{listingId} with a buyer, or{" "}
                      <button
                        onClick={() => { setSellerTab("mylistings"); fetchMyListings(); }}
                        className="neon-text-orange underline underline-offset-2"
                      >
                        view in My Listings
                      </button>
                      {" "}to come back later.
                    </p>
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
                {activeListing && activeListing.buyer !== ZERO_ADDR && sellerStep === 5 && (
                  <div className="text-xs glass-panel p-3 space-y-1">
                    <p><span className="text-gray-600 font-display tracking-wider">BUYER PK X</span> <span className="font-mono text-neon-orange/70">{activeListing.buyerPkX.toString(16).slice(0, 24)}...</span></p>
                    <p><span className="text-gray-600 font-display tracking-wider">BUYER PK Y</span> <span className="font-mono text-neon-orange/70">{activeListing.buyerPkY.toString(16).slice(0, 24)}...</span></p>
                  </div>
                )}
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
                  Submit the ZK proof on-chain. Old note spent, new note created for buyer, payment released.
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
                <button
                  onClick={() => { setSellerTab("mylistings"); fetchMyListings(); }}
                  className="mt-3 text-xs font-display tracking-wider neon-text-orange hover:underline"
                >
                  View My Listings →
                </button>
              </div>
            )}
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
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-cyan rounded neon-text-cyan">
            BUYER
          </span>
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
                Your secret key is in memory only. The seller uses your public key for the ZK proof.
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
            TON placed in escrow, ZK pubkey submitted. The seller will generate the ZK proof and complete the trade.
          </p>
          {buyerKeypair && (
            <div className="text-xs glass-panel p-3 mt-3 space-y-1">
              <p className="text-gray-600 font-display tracking-wider">SAVE YOUR SECRET KEY</p>
              <p className="font-mono text-yellow-400/70 break-all">{buyerKeypair.sk.toString(16)}</p>
              <p className="text-gray-600 font-body mt-1">You will need this to prove ownership of the received item.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
