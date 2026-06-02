import type { VaultReader } from "./vault/VaultReader.js";
import { parseNote, type ParsedNote } from "./parse/parseNote.js";
import { buildGraph, type BuildGraphResult } from "./graph/buildGraph.js";

export interface LoadedVault extends BuildGraphResult {
  notes: ParsedNote[];
  byId: Map<string, ParsedNote>;
}

/** Read and parse every note in the vault, then build the knowledge graph. */
export async function loadVault(vault: VaultReader): Promise<LoadedVault> {
  const paths = await vault.list();
  const notes: ParsedNote[] = [];
  for (const path of paths) {
    notes.push(parseNote(await vault.readFile(path)));
  }
  const built = buildGraph(notes);
  const byId = new Map(notes.map((n) => [n.id, n]));
  return { ...built, notes, byId };
}

/** Naive full-text search over note titles, tags, and body. */
export function searchNotes(
  notes: ParsedNote[],
  query: string,
  limit = 20,
): ParsedNote[] {
  const q = query.toLowerCase();
  return notes
    .filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q)) ||
        n.body.toLowerCase().includes(q),
    )
    .slice(0, limit);
}
