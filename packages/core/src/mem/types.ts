/** Fact types. Short codes keep the JSONL small and the injected pack cheap. */
export type FactType = "id" | "pref" | "rule" | "goal" | "dec" | "fact";

/**
 * One atomic memory, one JSONL line. Keys are deliberately short — this file is
 * read by machines (and every token counts when facts get injected into chats).
 */
export interface Fact {
  /** Unique id: `<device>-<time><rand>`. */
  id: string;
  /** Type code. */
  t: FactType;
  /** Scope: `about`, or a project/area id such as `Projects/Vetos`. */
  s: string;
  /** The fact itself, one short sentence. */
  x: string;
  /** Day it was recorded (YYYY-MM-DD). */
  ts: string;
  /** Where it came from, e.g. `chat/claude-vetos-logo-k2x9`. */
  src?: string;
  /** Id of an older fact this one replaces. */
  rep?: string;
  /** 1 = tombstone: this id is deleted. */
  del?: 1;
}

export type Provider = "claude" | "openai" | "gemini" | "grok";

/** Metadata stored in a chat note's frontmatter. */
export interface ChatMeta {
  id: string;
  provider: Provider;
  model: string;
  agent: string;
  project: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
