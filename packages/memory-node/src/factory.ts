import path from "node:path";
import type { Embedder, VectorStore } from "@osb/core";
import { HashEmbedder } from "./HashEmbedder.js";
import { TransformersEmbedder } from "./TransformersEmbedder.js";
import { ApiEmbedder } from "./ApiEmbedder.js";
import { JsonVectorStore } from "./JsonVectorStore.js";
import { SqliteVecStore } from "./SqliteVecStore.js";

export type EmbedderKind = "local" | "api" | "hash";
export type StoreKind = "json" | "sqlite";

/** Build an embedder by kind. `local` = Transformers.js, `api` = OpenAI-compatible. */
export function createEmbedder(kind: EmbedderKind = "local"): Embedder {
  switch (kind) {
    case "api":
      return new ApiEmbedder();
    case "hash":
      return new HashEmbedder();
    case "local":
    default:
      return new TransformersEmbedder();
  }
}

/**
 * Build a vector store under the vault's `.osb/` directory.
 * `json` (default) is dependency-free; `sqlite` uses sqlite-vec for scale.
 */
export function createVectorStore(
  kind: StoreKind,
  vaultDir: string,
  embedder: Embedder,
): VectorStore {
  const osbDir = path.join(vaultDir, ".osb");
  if (kind === "sqlite") {
    return SqliteVecStore.at(osbDir, embedder.dimensions);
  }
  return new JsonVectorStore(path.join(osbDir, "index.json"), embedder.model);
}
