import type { LlmClient } from "@osb/core";

export interface AnthropicChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
}

/**
 * {@link LlmClient} for the Anthropic Messages API. Uses `fetch`, no SDK.
 * An alternative classifier/summarizer backend for the brain-dump router.
 */
export class AnthropicChatClient implements LlmClient {
  readonly model: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #maxTokens: number;

  constructor(options: AnthropicChatClientOptions = {}) {
    this.model = options.model ?? "claude-haiku-4-5-20251001";
    this.#apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.#baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1/messages";
    this.#maxTokens = options.maxTokens ?? 1024;
    if (!this.#apiKey) {
      throw new Error(
        "AnthropicChatClient requires an API key (pass `apiKey` or set ANTHROPIC_API_KEY).",
      );
    }
  }

  async complete(request: { system?: string; prompt: string }): Promise<string> {
    const res = await fetch(this.#baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.#maxTokens,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: "user", content: request.prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    return json.content
      .map((b) => (b.type === "text" ? b.text ?? "" : ""))
      .join("");
  }
}
