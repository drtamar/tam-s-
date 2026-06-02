import type { VaultReader } from "../vault/VaultReader.js";
import type { NoteId } from "../vault/types.js";
import { parseNote } from "../parse/parseNote.js";
import type { Embedder } from "./Embedder.js";
import type { ChunkRecord, ScoredChunk, VectorStore } from "./VectorStore.js";
import { chunkNote, type ChunkOptions } from "./chunk.js";

export interface IndexResult {
  notesIndexed: number;
  notesSkipped: number;
  chunksWritten: number;
}

export interface RecallHit extends ScoredChunk {}

/**
 * Orchestrates the AI memory loop: chunk -> embed -> store -> recall. It is the
 * single entry point the CLI, MCP server, and (later) plugin call into for
 * semantic features. Storage and embedding are injected, keeping this pure.
 */
export class MemoryService {
  constructor(
    private readonly vault: VaultReader,
    private readonly embedder: Embedder,
    private readonly store: VectorStore,
    private readonly chunkOptions: ChunkOptions = {},
  ) {}

  /**
   * Index the vault into the vector store. Notes whose mtime is unchanged since
   * the last index are skipped (incremental). Pass `force` to reindex all.
   */
  async indexVault(options: { force?: boolean } = {}): Promise<IndexResult> {
    const paths = await this.vault.list();
    const indexed = await this.store.indexedNotes();
    let notesIndexed = 0;
    let notesSkipped = 0;
    let chunksWritten = 0;

    for (const path of paths) {
      const file = await this.vault.readFile(path);
      const note = parseNote(file);
      const prev = indexed.get(note.id);
      if (!options.force && prev !== undefined && file.mtimeMs !== undefined && prev >= file.mtimeMs) {
        notesSkipped++;
        continue;
      }

      const chunks = chunkNote(note, this.chunkOptions);
      await this.store.deleteByNote([note.id]);
      if (chunks.length > 0) {
        const vectors = await this.embedder.embed(chunks.map((c) => c.text));
        const records: ChunkRecord[] = chunks.map((c, i) => ({
          id: `${note.id}#${i}`,
          noteId: note.id,
          headingPath: c.headingPath,
          text: c.text,
          vector: vectors[i] as number[],
        }));
        await this.store.upsert(records);
        chunksWritten += records.length;
      }
      await this.store.setNoteMtime(note.id, file.mtimeMs ?? Date.now());
      notesIndexed++;
    }

    return { notesIndexed, notesSkipped, chunksWritten };
  }

  /** Semantic recall: return the top-k chunks most similar to `query`. */
  async recall(query: string, k = 5): Promise<RecallHit[]> {
    const [vector] = await this.embedder.embed([query]);
    if (!vector) return [];
    return this.store.query(vector, k);
  }

  /** Remove a note's chunks from the index (e.g. after deletion). */
  async forget(noteIds: NoteId[]): Promise<void> {
    await this.store.deleteByNote(noteIds);
  }
}
