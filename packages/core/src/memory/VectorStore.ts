import type { NoteId } from "../vault/types.js";

/** A chunk of a note plus its embedding, as stored in the vector index. */
export interface ChunkRecord {
  /** Stable chunk id, e.g. `noteId#3`. */
  id: string;
  noteId: NoteId;
  /** Heading trail this chunk lives under, e.g. `Intro > Background`. */
  headingPath: string;
  text: string;
  vector: number[];
}

/** A search hit with its similarity score in [0, 1]. */
export interface ScoredChunk {
  id: string;
  noteId: NoteId;
  headingPath: string;
  text: string;
  score: number;
}

/** Persistent nearest-neighbor store over note chunks. */
export interface VectorStore {
  /** Insert or replace chunk records. */
  upsert(records: ChunkRecord[]): Promise<void>;
  /** Delete every chunk belonging to the given notes. */
  deleteByNote(noteIds: NoteId[]): Promise<void>;
  /** Return the `k` most similar chunks to a query vector. */
  query(vector: number[], k: number): Promise<ScoredChunk[]>;
  /** Note ids currently present, with the mtime they were indexed at. */
  indexedNotes(): Promise<Map<NoteId, number>>;
  /** Record the mtime a note was indexed at (for incremental re-indexing). */
  setNoteMtime(noteId: NoteId, mtimeMs: number): Promise<void>;
  /** Flush and release resources. */
  close(): Promise<void>;
}
