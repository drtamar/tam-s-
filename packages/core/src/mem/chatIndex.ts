import type { VaultReader } from "../vault/VaultReader.js";
import { bm25 } from "./bm25.js";
import { CHATS_DIR, parseChat } from "./chat.js";
import type { ChatMeta, Provider } from "./types.js";

export interface ChatHit {
  path: string;
  meta: ChatMeta;
  /** Best-matching line from the conversation, for display. */
  snippet: string;
  score: number;
}

export interface ChatFilter {
  query?: string;
  provider?: Provider;
  project?: string;
  agent?: string;
  /** Inclusive YYYY-MM-DD bounds on the created date. */
  from?: string;
  to?: string;
  limit?: number;
}

interface Indexed {
  path: string;
  meta: ChatMeta;
  text: string;
}

/**
 * Search over saved chats — the "who was I talking to about what" answer.
 * Reads Chats/**, so it works the same on every device the vault syncs to.
 */
export class ChatIndex {
  #docs: Indexed[] = [];

  constructor(private readonly vault: VaultReader) {}

  async refresh(): Promise<number> {
    const paths = (await this.vault.list()).filter((p) => p.startsWith(`${CHATS_DIR}/`));
    const docs: Indexed[] = [];
    for (const path of paths) {
      const chat = parseChat(await this.vault.read(path));
      if (!chat) continue;
      docs.push({
        path,
        meta: chat.meta,
        text: `${chat.meta.title} ${chat.meta.summary} ${chat.meta.project} ${chat.meta.agent} ${chat.messages
          .map((m) => m.content)
          .join(" ")}`,
      });
    }
    this.#docs = docs;
    return docs.length;
  }

  search(f: ChatFilter = {}): ChatHit[] {
    let docs = this.#docs.filter(
      (d) =>
        (!f.provider || d.meta.provider === f.provider) &&
        (!f.project || d.meta.project === f.project) &&
        (!f.agent || d.meta.agent === f.agent) &&
        (!f.from || d.meta.created >= f.from) &&
        (!f.to || d.meta.created <= f.to),
    );
    const limit = f.limit ?? 20;

    if (!f.query?.trim()) {
      return docs
        .sort((a, b) => b.meta.updated.localeCompare(a.meta.updated))
        .slice(0, limit)
        .map((d) => ({ path: d.path, meta: d.meta, snippet: d.meta.summary, score: 0 }));
    }

    const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean);
    return bm25(docs, (d) => d.text, f.query)
      .slice(0, limit)
      .map(({ item, score }) => ({
        path: item.path,
        meta: item.meta,
        score,
        snippet: bestSnippet(item.text, terms) || item.meta.summary,
      }));
  }
}

function bestSnippet(text: string, terms: string[], width = 120): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return "";
  const start = Math.max(0, at - 30);
  const s = text.slice(start, start + width).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + s + (start + width < text.length ? "…" : "");
}
