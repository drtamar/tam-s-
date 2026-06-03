import type { LlmClient } from "../projects/types.js";
import type { LlmProvider } from "../config/MemoryConfig.js";
import { OpenAiChatClient } from "./OpenAiChatClient.js";
import { AnthropicChatClient } from "./AnthropicChatClient.js";

export {
  OpenAiChatClient,
  type OpenAiChatClientOptions,
} from "./OpenAiChatClient.js";
export {
  AnthropicChatClient,
  type AnthropicChatClientOptions,
} from "./AnthropicChatClient.js";

export interface LlmClientOptions {
  apiKey?: string;
  model?: string;
}

/** Build an LLM client for the brain-dump router by provider. */
export function createLlmClient(
  provider: LlmProvider = "openai",
  options: LlmClientOptions = {},
): LlmClient {
  return provider === "anthropic"
    ? new AnthropicChatClient(options)
    : new OpenAiChatClient(options);
}
