import { promises as fs } from "node:fs";
import path from "node:path";
import { cosineSimilarity } from "@osb/core";
import type {
  ChunkRecord,
  NoteId,
  ScoredChunk,
  VectorStore,
} from "@osb/core";

interface PersistShape {
  version: 1;
  model: string;
  notes: Record<string, number>;
  chunks: ChunkRecord[];
}

/**
 * Dependency-free vector store that persists to a single JSON file and does
 * brute-force cosine search. It always works (no native build, no service) and
 * is the reliable default for small-to-medium vaults. For large vaults, use
 * {@link SqliteVecStore}.
 */
export class JsonVectorStore implements VectorStore {
  #chunks = new Map<string, ChunkRecord>();
  #notes = new Map<NoteId, number>();
  #loaded = false;

  /** @param file Path to the JSON index, e.g. `<vault>/.osb/index.json`. */
  constructor(
    private readonly file: string,
    private readonly model = "unknown",
  ) {}

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const data = JSON.parse(raw) as PersistShape;
      for (const c of data.chunks) this.#chunks.set(c.id, c);
      this.#notes = new Map(Object.entries(data.notes));
    } catch {
      // No index yet — start empty.
    }
  }

  async #persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const data: PersistShape = {
      version: 1,
      model: this.model,
      notes: Object.fromEntries(this.#notes),
      chunks: [...this.#chunks.values()],
    };
    await fs.writeFile(this.file, JSON.stringify(data), "utf8");
  }

  async upsert(records: ChunkRecord[]): Promise<void> {
    await this.#ensureLoaded();
    for (const r of records) this.#chunks.set(r.id, r);
    await this.#persist();
  }

  async deleteByNote(noteIds: NoteId[]): Promise<void> {
    await this.#ensureLoaded();
    const set = new Set(noteIds);
    for (const [id, chunk] of this.#chunks) {
      if (set.has(chunk.noteId)) this.#chunks.delete(id);
    }
    await this.#persist();
  }

  async query(vector: number[], k: number): Promise<ScoredChunk[]> {
    await this.#ensureLoaded();
    const scored: ScoredChunk[] = [];
    for (const c of this.#chunks.values()) {
      scored.push({
        id: c.id,
        noteId: c.noteId,
        headingPath: c.headingPath,
        text: c.text,
        score: cosineSimilarity(vector, c.vector),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  async indexedNotes(): Promise<Map<NoteId, number>> {
    await this.#ensureLoaded();
    return new Map(this.#notes);
  }

  async setNoteMtime(noteId: NoteId, mtimeMs: number): Promise<void> {
    await this.#ensureLoaded();
    this.#notes.set(noteId, mtimeMs);
    await this.#persist();
  }

  async close(): Promise<void> {
    if (this.#loaded) await this.#persist();
  }
}
