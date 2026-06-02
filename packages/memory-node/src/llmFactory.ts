import type { LlmClient } from "@osb/core";
import { OpenAiChatClient } from "./OpenAiChatClient.js";
import { AnthropicChatClient } from "./AnthropicChatClient.js";

export type LlmKind = "openai" | "anthropic";

/** Build an LLM client for the brain-dump router by provider kind. */
export function createLlmClient(kind: LlmKind = "openai"): LlmClient {
  return kind === "anthropic"
    ? new AnthropicChatClient()
    : new OpenAiChatClient();
}
