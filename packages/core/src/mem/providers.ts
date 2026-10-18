import type { ChatMessage, Provider } from "./types.js";

export interface HttpRequest {
  url: string;
  /** Defaults to POST. */
  method?: "GET" | "POST" | "PATCH";
  headers: Record<string, string>;
  body?: string;
}
export interface HttpResponse {
  status: number;
  text: string;
}
/**
 * Injected transport. Node/tests use `fetchHttp`; the Obsidian plugin passes a
 * wrapper around `requestUrl`, which bypasses browser CORS (Anthropic's API
 * rejects plain cross-origin fetches from app:// origins).
 */
export type Http = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchHttp: Http = async (req) => {
  const res = await fetch(req.url, {
    method: req.method ?? "POST",
    headers: req.headers,
    body: req.body,
  });
  return { status: res.status, text: await res.text() };
};

export interface ChatOptions {
  system?: string;
  model: string;
  maxTokens?: number;
}

export interface ChatProvider {
  readonly id: Provider;
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
}

/** Starting models. Names change often — they are editable in settings. */
export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  grok: "grok-3-mini",
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  grok: "Grok",
};

/** OpenAI-style endpoints: OpenAI itself, plus Gemini and Grok compat layers. */
const COMPAT_URL: Record<Exclude<Provider, "claude">, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
};

function parseOrThrow(label: string, res: HttpResponse): any {
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    json = undefined;
  }
  if (res.status < 200 || res.status >= 300) {
    const msg = json?.error?.message ?? json?.error ?? res.text.slice(0, 200);
    throw new Error(`${label} ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

class CompatProvider implements ChatProvider {
  constructor(
    readonly id: Exclude<Provider, "claude">,
    private readonly apiKey: string,
    private readonly http: Http,
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    const all = opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages;
    const res = await this.http({
      url: COMPAT_URL[this.id],
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: all,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
    const json = parseOrThrow(PROVIDER_LABELS[this.id], res);
    return json?.choices?.[0]?.message?.content ?? "";
  }
}

class ClaudeProvider implements ChatProvider {
  readonly id = "claude" as const;
  constructor(
    private readonly apiKey: string,
    private readonly http: Http,
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    const res = await this.http({
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        ...(opts.system ? { system: opts.system } : {}),
        messages: messages.filter((m) => m.role !== "system"),
      }),
    });
    const json = parseOrThrow("Claude", res);
    return (json?.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("");
  }
}

export function createProvider(id: Provider, apiKey: string, http: Http = fetchHttp): ChatProvider {
  if (!apiKey) throw new Error(`No API key set for ${PROVIDER_LABELS[id]}.`);
  return id === "claude" ? new ClaudeProvider(apiKey, http) : new CompatProvider(id, apiKey, http);
}
