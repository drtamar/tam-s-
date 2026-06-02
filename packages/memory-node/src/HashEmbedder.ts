import type { Embedder } from "@osb/core";

/**
 * Dependency-free, deterministic embedder using hashed token counts (a "bag of
 * words" projected into a fixed space). It needs no model download and always
 * works, which makes it the reliable default for tests and offline/constrained
 * environments. It captures lexical overlap, not deep semantics — switch to
 * {@link TransformersEmbedder} or {@link ApiEmbedder} for real semantic recall.
 */
export class HashEmbedder implements Embedder {
  readonly model = "hash-bow";
  constructor(readonly dimensions = 256) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.#embedOne(text));
  }

  #embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      let h = 2166136261;
      for (let i = 0; i < token.length; i++) {
        h ^= token.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = (h >>> 0) % this.dimensions;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    // L2-normalize so cosine similarity behaves well.
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
    return vec.map((x) => x / norm);
  }
}
