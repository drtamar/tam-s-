export { HashEmbedder } from "./HashEmbedder.js";
export {
  TransformersEmbedder,
  type TransformersEmbedderOptions,
} from "./TransformersEmbedder.js";
export { ApiEmbedder, type ApiEmbedderOptions } from "./ApiEmbedder.js";
export { JsonVectorStore } from "./JsonVectorStore.js";
export { SqliteVecStore } from "./SqliteVecStore.js";
export {
  createEmbedder,
  createVectorStore,
  type EmbedderKind,
  type StoreKind,
} from "./factory.js";
// LLM clients now live in @osb/core (pure, fetch-based). Re-exported here for
// back-compat with the CLI/MCP server.
export {
  OpenAiChatClient,
  AnthropicChatClient,
  createLlmClient,
  type OpenAiChatClientOptions,
  type AnthropicChatClientOptions,
} from "@osb/core/llm";
import type { LlmProvider } from "@osb/core";
/** @deprecated use `LlmProvider` from `@osb/core`. */
export type LlmKind = LlmProvider;
export { loadMemoryConfig, saveMemoryConfig } from "./config.js";
