import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HashEmbedder } from "../src/HashEmbedder.js";
import { JsonVectorStore } from "../src/JsonVectorStore.js";
import type { ChunkRecord } from "@osb/core";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-store-"));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("HashEmbedder", () => {
  it("produces normalized vectors of the configured size", async () => {
    const e = new HashEmbedder(64);
    const [v] = await e.embed(["hello world hello"]);
    expect(v).toHaveLength(64);
    const norm = Math.sqrt((v as number[]).reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe("JsonVectorStore", () => {
  it("upserts, queries by similarity, and persists across instances", async () => {
    const file = path.join(dir, "index.json");
    const embedder = new HashEmbedder(64);
    const store = new JsonVectorStore(file, embedder.model);

    const texts = ["graph theory and nodes", "cooking pasta recipes"];
    const vectors = await embedder.embed(texts);
    const records: ChunkRecord[] = texts.map((text, i) => ({
      id: `n${i}#0`,
      noteId: `n${i}`,
      headingPath: "",
      text,
      vector: vectors[i] as number[],
    }));
    await store.upsert(records);
    await store.setNoteMtime("n0", 1);

    const [q] = await embedder.embed(["graph nodes"]);
    const hits = await store.query(q as number[], 1);
    expect(hits[0]?.noteId).toBe("n0");

    // Reload from disk in a fresh instance.
    const reloaded = new JsonVectorStore(file, embedder.model);
    expect((await reloaded.indexedNotes()).get("n0")).toBe(1);
    const hits2 = await reloaded.query(q as number[], 1);
    expect(hits2[0]?.noteId).toBe("n0");
  });

  it("deletes chunks by note", async () => {
    const file = path.join(dir, "del.json");
    const store = new JsonVectorStore(file);
    await store.upsert([
      { id: "a#0", noteId: "a", headingPath: "", text: "x", vector: [1, 0] },
      { id: "b#0", noteId: "b", headingPath: "", text: "y", vector: [0, 1] },
    ]);
    await store.deleteByNote(["a"]);
    const hits = await store.query([1, 0], 5);
    expect(hits.map((h) => h.noteId)).not.toContain("a");
  });
});
