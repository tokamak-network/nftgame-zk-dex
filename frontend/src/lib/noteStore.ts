import type { ContractName } from "./types";

export type NoteType = "nft" | "lootbox" | "item" | "card";

export interface StoredNote {
  id: string;
  hash: string; // bytes32 note hash
  contractName: ContractName;
  type: NoteType;
  label: string;
  metadata: Record<string, string>;
  createdAt: number;
}

// Keyed by wallet address so different accounts have separate note stores.
let _walletAddress = "default";

export function setNoteStoreAddress(address: string) {
  _walletAddress = address.toLowerCase();
}

function storageKey() {
  return `neon-arena-notes-${_walletAddress}`;
}

function readAll(): StoredNote[] {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(notes: StoredNote[]) {
  localStorage.setItem(storageKey(), JSON.stringify(notes));
}

export function getNotes(): StoredNote[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function addNote(
  note: Omit<StoredNote, "id" | "createdAt">,
): StoredNote {
  const notes = readAll();
  const entry: StoredNote = {
    ...note,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  notes.push(entry);
  writeAll(notes);
  return entry;
}

export function removeNote(id: string) {
  const notes = readAll().filter((n) => n.id !== id);
  writeAll(notes);
}

export function clearNotes() {
  localStorage.removeItem(storageKey());
}

export function exportNotes(): string {
  const notes = readAll();
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
  }, null, 2);
}

export function importNotes(json: string): { added: number; skipped: number } {
  const data = JSON.parse(json);
  const incoming: StoredNote[] = data.notes ?? data;
  const existing = readAll();
  const existingHashes = new Set(existing.map((n) => n.hash));

  let added = 0;
  let skipped = 0;

  for (const note of incoming) {
    if (existingHashes.has(note.hash)) {
      skipped++;
      continue;
    }
    existing.push({
      ...note,
      id: note.id || crypto.randomUUID(),
      createdAt: note.createdAt || Date.now(),
    });
    existingHashes.add(note.hash);
    added++;
  }

  writeAll(existing);
  return { added, skipped };
}
