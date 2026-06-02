/**
 * Turns text into vectors. Implemented by `memory-node` (local Transformers.js
 * or a hosted API). The engine only depends on this interface so the embedding
 * backend can be swapped per environment.
 */
export interface Embedder {
  /** Dimensionality of the produced vectors. */
  readonly dimensions: number;
  /** Identifier of the underlying model, stored alongside vectors. */
  readonly model: string;
  /** Embed a batch of texts, preserving order. */
  embed(texts: string[]): Promise<number[][]>;
}
