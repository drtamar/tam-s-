import type { Embedder } from "@osb/core";

export interface ApiEmbedderOptions {
  /** API key. Defaults to `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Model id. Default: `text-embedding-3-small`. */
  model?: string;
  /** Vector dimensionality. Default: 1536. */
  dimensions?: number;
  /** Endpoint URL. Default: OpenAI embeddings (override for Voyage/compatible). */
  baseUrl?: string;
}

/**
 * Hosted embedder for an OpenAI-compatible `/embeddings` endpoint (OpenAI,
 * Voyage via a compatible gateway, etc.). Uses `fetch`, so no SDK dependency.
 * Choose this over {@link TransformersEmbedder} for higher quality on large vaults.
 */
export class ApiEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(options: ApiEmbedderOptions = {}) {
    this.model = options.model ?? "text-embedding-3-small";
    this.dimensions = options.dimensions ?? 1536;
    this.#apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.#baseUrl = options.baseUrl ?? "https://api.openai.com/v1/embeddings";
    if (!this.#apiKey) {
      throw new Error(
        "ApiEmbedder requires an API key (pass `apiKey` or set OPENAI_API_KEY).",
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(this.#baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Embedding API error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}
