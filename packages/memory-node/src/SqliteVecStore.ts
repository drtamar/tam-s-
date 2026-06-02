import path from "node:path";
import { createRequire } from "node:module";
import type {
  ChunkRecord,
  NoteId,
  ScoredChunk,
  VectorStore,
} from "@osb/core";

const require = createRequire(import.meta.url);

/* Minimal structural types so we don't hard-depend on the optional packages. */
interface Statement {
  run(...params: unknown[]): { lastInsertRowid: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}
interface Db {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

/**
 * Scalable vector store backed by `better-sqlite3` + `sqlite-vec`, kept in a
 * single file co-located with the vault (`.osb/index.db`). This is the scale-up
 * path beyond {@link JsonVectorStore}. Both packages are optional dependencies
 * and are loaded lazily; a clear error is thrown if they're missing.
 */
export class SqliteVecStore implements VectorStore {
  #db: Db;

  constructor(
    private readonly file: string,
    private readonly dimensions: number,
  ) {
    let Database: new (file: string) => Db;
    let sqliteVec: { load(db: Db): void };
    try {
      Database = require("better-sqlite3") as new (file: string) => Db;
      sqliteVec = require("sqlite-vec") as { load(db: Db): void };
    } catch {
      throw new Error(
        "SqliteVecStore requires the optional dependencies 'better-sqlite3' and 'sqlite-vec'. " +
          "Install them, or use JsonVectorStore.",
      );
    }
    this.#db = new Database(this.file);
    sqliteVec.load(this.#db);
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS notes (note_id TEXT PRIMARY KEY, mtime REAL);
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        heading_path TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chunks_note ON chunks(note_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        embedding float[${this.dimensions}] distance_metric=cosine
      );
    `);
  }

  /** @param file Path like `<vault>/.osb/index.db`. */
  static at(dir: string, dimensions: number): SqliteVecStore {
    return new SqliteVecStore(path.join(dir, "index.db"), dimensions);
  }

  async upsert(records: ChunkRecord[]): Promise<void> {
    const insChunk = this.#db.prepare(
      "INSERT OR REPLACE INTO chunks (chunk_id, note_id, heading_path, text) VALUES (?, ?, ?, ?)",
    );
    const insVec = this.#db.prepare(
      "INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)",
    );
    const delVec = this.#db.prepare("DELETE FROM vec_chunks WHERE rowid = ?");
    const rowidOf = this.#db.prepare(
      "SELECT rowid FROM chunks WHERE chunk_id = ?",
    );
    for (const r of records) {
      insChunk.run(r.id, r.noteId, r.headingPath, r.text);
      const row = rowidOf.get(r.id) as { rowid: number } | undefined;
      if (row) {
        delVec.run(row.rowid);
        insVec.run(row.rowid, JSON.stringify(r.vector));
      }
    }
  }

  async deleteByNote(noteIds: NoteId[]): Promise<void> {
    const rows = this.#db.prepare("SELECT rowid FROM chunks WHERE note_id = ?");
    const delVec = this.#db.prepare("DELETE FROM vec_chunks WHERE rowid = ?");
    const delChunk = this.#db.prepare("DELETE FROM chunks WHERE note_id = ?");
    for (const noteId of noteIds) {
      for (const row of rows.all(noteId) as { rowid: number }[]) {
        delVec.run(row.rowid);
      }
      delChunk.run(noteId);
    }
  }

  async query(vector: number[], k: number): Promise<ScoredChunk[]> {
    const rows = this.#db
      .prepare(
        `SELECT c.chunk_id AS id, c.note_id AS noteId, c.heading_path AS headingPath,
                c.text AS text, knn.distance AS distance
         FROM (
           SELECT rowid, distance FROM vec_chunks
           WHERE embedding MATCH ? ORDER BY distance LIMIT ?
         ) knn
         JOIN chunks c ON c.rowid = knn.rowid
         ORDER BY knn.distance`,
      )
      .all(JSON.stringify(vector), k) as {
      id: string;
      noteId: string;
      headingPath: string;
      text: string;
      distance: number;
    }[];
    // sqlite-vec cosine distance = 1 - cosine_similarity.
    return rows.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      headingPath: r.headingPath,
      text: r.text,
      score: 1 - r.distance,
    }));
  }

  async indexedNotes(): Promise<Map<NoteId, number>> {
    const rows = this.#db
      .prepare("SELECT note_id AS noteId, mtime FROM notes")
      .all() as { noteId: string; mtime: number }[];
    return new Map(rows.map((r) => [r.noteId, r.mtime]));
  }

  async setNoteMtime(noteId: NoteId, mtimeMs: number): Promise<void> {
    this.#db
      .prepare("INSERT OR REPLACE INTO notes (note_id, mtime) VALUES (?, ?)")
      .run(noteId, mtimeMs);
  }

  async close(): Promise<void> {
    this.#db.close();
  }
}
