import { MemoryService, NodeVaultReader } from "@osb/core";
import {
  createEmbedder,
  createVectorStore,
  type EmbedderKind,
  type StoreKind,
} from "@osb/memory-node";

export interface MemoryOptions {
  vault: string;
  embedder?: EmbedderKind;
  store?: StoreKind;
}

/** Wire a {@link MemoryService} for a vault from CLI options. */
export function createMemory(options: MemoryOptions): {
  vault: NodeVaultReader;
  memory: MemoryService;
} {
  const vault = new NodeVaultReader(options.vault);
  const embedder = createEmbedder(options.embedder ?? "local");
  const store = createVectorStore(options.store ?? "json", options.vault, embedder);
  const memory = new MemoryService(vault, embedder, store);
  return { vault, memory };
}
