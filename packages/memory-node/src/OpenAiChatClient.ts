import type { LlmClient } from "@osb/core";

export interface OpenAiChatClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
}

/**
 * {@link LlmClient} for an OpenAI-compatible `/chat/completions` endpoint. Uses
 * `fetch`, so there's no SDK dependency. Drives classification + summarization
 * in the brain-dump router.
 */
export class OpenAiChatClient implements LlmClient {
  readonly model: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #temperature: number;

  constructor(options: OpenAiChatClientOptions = {}) {
    this.model = options.model ?? "gpt-4o-mini";
    this.#apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.#baseUrl =
      options.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.#temperature = options.temperature ?? 0;
    if (!this.#apiKey) {
      throw new Error(
        "OpenAiChatClient requires an API key (pass `apiKey` or set OPENAI_API_KEY).",
      );
    }
  }

  async complete(request: { system?: string; prompt: string }): Promise<string> {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];
    const res = await fetch(this.#baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.#temperature,
        messages,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message.content ?? "";
  }
}
