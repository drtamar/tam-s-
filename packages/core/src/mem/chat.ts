import { slugify } from "../util/slugify.js";
import type { ChatMessage, ChatMeta, Provider } from "./types.js";

export const CHATS_DIR = "Chats";

const needsQuote = (v: string) => /[:#\n"]|^\s|\s$|^$/.test(v);
const q = (v: string) => (needsQuote(v) ? JSON.stringify(v) : v);

/** Tiny YAML-subset reader (flat `key: value`) — no gray-matter, so it runs on mobile. */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        /* keep raw */
      }
    }
    data[line.slice(0, i).trim()] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

/** Path for a new chat note: Chats/YYYY/MM/<provider>-<slug>-<id>.md */
export function chatPath(meta: Pick<ChatMeta, "id" | "provider" | "title" | "created">): string {
  const [y, mo] = meta.created.split("-");
  const slug = slugify(meta.title).slice(0, 40) || "chat";
  return `${CHATS_DIR}/${y}/${mo}/${meta.provider}-${slug}-${meta.id}.md`;
}

export function newChatId(now = new Date()): string {
  return now.getTime().toString(36) + Math.random().toString(36).slice(2, 4);
}

/** Render a chat as a Markdown note: searchable by Obsidian itself and by us. */
export function renderChat(meta: ChatMeta, messages: ChatMessage[]): string {
  const fm = [
    "---",
    "type: chat",
    `id: ${meta.id}`,
    `provider: ${meta.provider}`,
    `model: ${q(meta.model)}`,
    `agent: ${q(meta.agent)}`,
    `project: ${q(meta.project)}`,
    `title: ${q(meta.title)}`,
    `summary: ${q(meta.summary)}`,
    `created: ${meta.created}`,
    `updated: ${meta.updated}`,
    "---",
  ].join("\n");
  const body = messages.map((m) => `### ${m.role}\n\n${m.content.trim()}\n`).join("\n");
  return `${fm}\n\n# ${meta.title}\n\n${body}`;
}

export function parseChat(text: string): { meta: ChatMeta; messages: ChatMessage[] } | null {
  const { data, body } = parseFrontmatter(text);
  if (data.type !== "chat") return null;
  const meta: ChatMeta = {
    id: data.id ?? "",
    provider: (data.provider as Provider) ?? "claude",
    model: data.model ?? "",
    agent: data.agent ?? "",
    project: data.project ?? "",
    title: data.title ?? "",
    summary: data.summary ?? "",
    created: data.created ?? "",
    updated: data.updated ?? "",
  };
  const messages: ChatMessage[] = [];
  const re = /^### (user|assistant|system)\r?\n\r?\n([\s\S]*?)(?=^### (?:user|assistant|system)\r?\n|(?![\s\S]))/gm;
  for (const m of body.matchAll(re)) {
    messages.push({ role: m[1] as ChatMessage["role"], content: (m[2] ?? "").trim() });
  }
  return { meta, messages };
}

/** One-line auto summary: the first user message, trimmed. Cheap, no LLM call. */
export function quickSummary(messages: ChatMessage[], max = 140): string {
  const first = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim() ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
