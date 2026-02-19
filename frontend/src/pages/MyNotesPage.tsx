import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { getNotes, removeNote, clearNotes, exportNotes, importNotes, type StoredNote, type NoteType } from "../lib/noteStore";

const TYPE_CONFIG: Record<NoteType, { label: string; color: string; border: string; bg: string }> = {
  nft: { label: "NFT", color: "neon-text-cyan", border: "border-neon-cyan", bg: "bg-neon-cyan/10" },
  lootbox: { label: "LOOT", color: "neon-text-magenta", border: "border-neon-magenta", bg: "bg-neon-magenta/10" },
  item: { label: "ITEM", color: "neon-text-orange", border: "border-neon-orange", bg: "bg-neon-orange/10" },
  card: { label: "CARD", color: "neon-text-green", border: "border-neon-green", bg: "bg-neon-green/10" },
};

const STATE_LABELS: Record<number, { text: string; class: string }> = {
  0: { text: "Invalid", class: "text-gray-500" },
  1: { text: "Valid", class: "neon-text-green" },
  2: { text: "Spent", class: "neon-text-magenta" },
};

type ChainState = Record<string, number | null>; // noteId -> state (0/1/2) or null if can't query

export function MyNotesPage() {
  const { signer, isConnected } = useWallet();
  const privateNFT = useContract("PrivateNFT", signer);
  const gamingItemTrade = useContract("GamingItemTrade", signer);

  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [chainStates, setChainStates] = useState<ChainState>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<NoteType | "all">("all");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNotes = useCallback(() => {
    setNotes(getNotes());
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Query chain state for notes that support getNoteState
  const refreshChainStates = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    const states: ChainState = {};

    for (const note of notes) {
      try {
        if (note.contractName === "PrivateNFT" && privateNFT) {
          const state = await privateNFT.getNoteState(note.hash);
          states[note.id] = Number(state);
        } else if (note.contractName === "GamingItemTrade" && gamingItemTrade) {
          const state = await gamingItemTrade.getNoteState(note.hash);
          states[note.id] = Number(state);
        } else {
          states[note.id] = null; // No getNoteState for LootBox/CardDraw
        }
      } catch {
        states[note.id] = null;
      }
    }

    setChainStates(states);
    setLoading(false);
  }, [notes, isConnected, privateNFT, gamingItemTrade]);

  useEffect(() => {
    if (notes.length > 0 && isConnected) {
      refreshChainStates();
    }
  }, [notes.length, isConnected, refreshChainStates]);

  function handleRemove(id: string) {
    removeNote(id);
    loadNotes();
  }

  function handleClear() {
    clearNotes();
    loadNotes();
    setChainStates({});
  }

  function handleExport() {
    const json = exportNotes();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neon-arena-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { added, skipped } = importNotes(reader.result as string);
        setImportMsg(`+${added} added, ${skipped} duplicates skipped`);
        loadNotes();
        setTimeout(() => setImportMsg(null), 4000);
      } catch {
        setImportMsg("Invalid file format");
        setTimeout(() => setImportMsg(null), 4000);
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  const filtered = filter === "all" ? notes : notes.filter((n) => n.type === filter);

  if (!isConnected) {
    return (
      <div className="glass-panel border border-border-dim p-8 text-center max-w-md mx-auto">
        <p className="font-display text-sm tracking-wider neon-text-cyan">WALLET REQUIRED</p>
        <p className="font-body text-gray-500 mt-2">Connect your wallet to view notes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 stagger-in">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-neon-cyan rounded neon-text-cyan">
            VAULT
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-wider neon-text-cyan mb-1">
          My Notes
        </h1>
        <p className="text-sm font-body text-gray-500">
          Locally stored UTXO notes from your ZK transactions. Notes are saved in
          your browser — losing them means losing access to your assets.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {(["all", "nft", "lootbox", "item", "card"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-display tracking-wider px-3 py-1.5 rounded border transition-all ${
                filter === f
                  ? "neon-btn-cyan border-neon-cyan bg-neon-cyan/10"
                  : "border-border-dim text-gray-500 hover:text-gray-300 hover:border-gray-500"
              }`}
            >
              {f === "all" ? "ALL" : TYPE_CONFIG[f].label}
              {f !== "all" && (
                <span className="ml-1 text-gray-600">
                  {notes.filter((n) => n.type === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshChainStates}
            disabled={loading || notes.length === 0}
            className="neon-btn neon-btn-cyan text-xs py-1.5 px-3"
          >
            {loading ? "Syncing..." : "Sync Chain"}
          </button>
          {notes.length > 0 && (
            <button
              onClick={handleClear}
              className="neon-btn neon-btn-magenta text-xs py-1.5 px-3"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Notes list */}
      {filtered.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <p className="font-display text-sm tracking-wider text-gray-600">NO NOTES FOUND</p>
          <p className="font-body text-xs text-gray-600 mt-2">
            Complete transactions in F1/F4/F5/F8 to see notes here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => {
            const config = TYPE_CONFIG[note.type];
            const chainState = chainStates[note.id];

            return (
              <div
                key={note.id}
                className="glass-panel border border-border-dim p-4 hover:border-gray-600 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Type badge + label */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`font-display text-[10px] font-bold tracking-[0.15em] px-1.5 py-0.5 border rounded ${config.color} ${config.border} ${config.bg}`}
                      >
                        {config.label}
                      </span>
                      <span className="font-body text-sm text-gray-300">{note.label}</span>
                    </div>

                    {/* Hash */}
                    <p className="font-mono text-xs text-gray-500 break-all">
                      {note.hash}
                    </p>

                    {/* Metadata */}
                    {Object.keys(note.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {Object.entries(note.metadata).map(([key, val]) => (
                          <span key={key} className="text-xs font-body">
                            <span className="text-gray-600 font-display tracking-wider uppercase">{key}</span>{" "}
                            <span className="text-gray-400">{val}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-[10px] font-mono text-gray-700 mt-2">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Right side: chain state + delete */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {chainState !== undefined && chainState !== null ? (
                      <span
                        className={`font-display text-xs font-bold tracking-wider ${STATE_LABELS[chainState]?.class || "text-gray-500"}`}
                      >
                        {STATE_LABELS[chainState]?.text || "Unknown"}
                      </span>
                    ) : (
                      <span className="font-display text-[10px] tracking-wider text-gray-700">
                        {note.type === "lootbox" || note.type === "card" ? "LOCAL" : "—"}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemove(note.id)}
                      className="text-gray-700 hover:neon-text-magenta text-xs font-display tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Backup / Restore */}
      <div className="glass-panel border border-border-dim p-4 space-y-3">
        <p className="font-display text-xs font-bold tracking-wider text-gray-400">BACKUP / RESTORE</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={notes.length === 0}
            className="neon-btn neon-btn-cyan text-xs py-1.5 px-3"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="neon-btn neon-btn-green text-xs py-1.5 px-3"
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          {importMsg && (
            <span className="font-body text-xs neon-text-yellow">{importMsg}</span>
          )}
        </div>
        <p className="font-body text-[11px] text-gray-600">
          Export your notes as a JSON file to back up. Import to restore on another browser or device.
        </p>
      </div>

      {/* Summary */}
      {notes.length > 0 && (
        <div className="glass-panel p-4 flex justify-between items-center text-xs font-body">
          <span className="text-gray-500">
            {notes.length} note{notes.length !== 1 ? "s" : ""} stored locally
          </span>
          <span className="text-gray-700 font-mono">
            {Math.round(new Blob([localStorage.getItem("neon-arena-notes") || ""]).size / 1024)}KB
          </span>
        </div>
      )}
    </div>
  );
}
