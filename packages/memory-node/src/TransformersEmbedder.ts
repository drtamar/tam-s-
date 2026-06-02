import type { Embedder } from "@osb/core";

export interface TransformersEmbedderOptions {
  /** HF model id. Default: `Xenova/bge-small-en-v1.5` (384-dim). */
  model?: string;
  /** Vector dimensionality of the model. Default: 384. */
  dimensions?: number;
  /** ONNX quantization dtype. Default: `q8` (small + fast). */
  dtype?: "fp32" | "fp16" | "q8" | "q4";
}

/** Minimal shape of the bits of Transformers.js we depend on. */
interface FeatureExtractor {
  (
    input: string[],
    opts: { pooling: "mean"; normalize: boolean },
  ): Promise<{ tolist(): number[][] }>;
}
interface TransformersModule {
  pipeline(
    task: "feature-extraction",
    model: string,
    opts: { dtype: string },
  ): Promise<FeatureExtractor>;
}

/**
 * Local semantic embedder backed by Transformers.js (`@huggingface/transformers`).
 * Runs entirely on-device — private and free, no API key. The library and model
 * are loaded lazily on first use, so importing this class is cheap and the model
 * is only fetched when you actually embed.
 *
 * `@huggingface/transformers` is an optional dependency; install it to use this.
 */
export class TransformersEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  readonly #dtype: NonNullable<TransformersEmbedderOptions["dtype"]>;
  #extractor: Promise<FeatureExtractor> | undefined;

  constructor(options: TransformersEmbedderOptions = {}) {
    this.model = options.model ?? "Xenova/bge-small-en-v1.5";
    this.dimensions = options.dimensions ?? 384;
    this.#dtype = options.dtype ?? "q8";
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.#load();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  }

  #load(): Promise<FeatureExtractor> {
    if (!this.#extractor) {
      // Specifier kept in a variable so the optional dependency isn't required
      // at type-check time when it isn't installed.
      const moduleName = "@huggingface/transformers";
      this.#extractor = import(moduleName)
        .catch(() => {
          throw new Error(
            "TransformersEmbedder requires the optional dependency '@huggingface/transformers'. " +
              "Install it with `pnpm add @huggingface/transformers`, or use HashEmbedder / ApiEmbedder.",
          );
        })
        .then((mod) =>
          (mod as TransformersModule).pipeline("feature-extraction", this.model, {
            dtype: this.#dtype,
          }),
        );
    }
    return this.#extractor;
  }
}
