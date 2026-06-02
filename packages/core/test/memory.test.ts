import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import { MemoryService } from "../src/memory/MemoryService.js";
import type { Embedder } from "../src/memory/Embedder.js";
import type {
  ChunkRecord,
  ScoredChunk,
  VectorStore,
} from "../src/memory/VectorStore.js";
import { cosineSimilarity } from "../src/util/cosine.js";
import { chunkNote } from "../src/memory/chunk.js";
import { parseNote } from "../src/parse/parseNote.js";

const vaultDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "sample-vault",
);

/** Deterministic bag-of-words embedder so tests run without a real model. */
class StubEmbedder implements Embedder {
  readonly dimensions = 32;
  readonly model = "stub";
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      for (const tok of t.toLowerCase().match(/[a-z]+/g) ?? []) {
        let h = 0;
        for (const ch of tok) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % this.dimensions] += 1;
      }
      return v;
    });
  }
}

class MemoryStore implements VectorStore {
  rows: ChunkRecord[] = [];
  mtimes = new Map<string, number>();
  async upsert(records: ChunkRecord[]): Promise<void> {
    this.rows.push(...records);
  }
  async deleteByNote(noteIds: string[]): Promise<void> {
    const set = new Set(noteIds);
    this.rows = this.rows.filter((r) => !set.has(r.noteId));
  }
  async query(vector: number[], k: number): Promise<ScoredChunk[]> {
    return this.rows
      .map((r) => ({ ...r, score: cosineSimilarity(vector, r.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ vector: _v, ...rest }) => rest);
  }
  async indexedNotes(): Promise<Map<string, number>> {
    return new Map(this.mtimes);
  }
  async setNoteMtime(noteId: string, mtimeMs: number): Promise<void> {
    this.mtimes.set(noteId, mtimeMs);
  }
  async close(): Promise<void> {}
}

describe("chunking", () => {
  it("splits on headings and records the heading trail", () => {
    const note = parseNote({
      path: "Memory.md",
      content: "# A\n\nintro\n\n## B\n\ndetail",
    });
    const chunks = chunkNote(note);
    expect(chunks.map((c) => c.headingPath)).toEqual(["A", "A > B"]);
  });
});

describe("MemoryService", () => {
  it("indexes the vault and recalls relevant chunks", async () => {
    const vault = new NodeVaultReader(vaultDir);
    const store = new MemoryStore();
    const memory = new MemoryService(vault, new StubEmbedder(), store);

    const result = await memory.indexVault();
    expect(result.notesIndexed).toBe(4);
    expect(result.chunksWritten).toBeGreaterThan(0);

    const hits = await memory.recall("embeddings vectors semantic", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.noteId).toBe("notes/Memory");
  });

  it("skips unchanged notes on re-index", async () => {
    const vault = new NodeVaultReader(vaultDir);
    const store = new MemoryStore();
    const memory = new MemoryService(vault, new StubEmbedder(), store);
    await memory.indexVault();
    const second = await memory.indexVault();
    expect(second.notesSkipped).toBe(4);
    expect(second.notesIndexed).toBe(0);
  });
});
