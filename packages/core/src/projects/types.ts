import type { NoteId, NotePath } from "../vault/types.js";

/** A project the second memory system can route brain dumps into. */
export interface ProjectProfile {
  id: NoteId;
  path: NotePath;
  title: string;
  /** Short description used to classify dumps (from the note body / index). */
  description: string;
}

/** A raw, unstructured capture to be routed to a project. */
export interface BrainDump {
  /** Stable id, e.g. the source note id or a generated capture id. */
  id: string;
  text: string;
  /** Optional source note to link back to (e.g. a daily note id). */
  source?: NoteId;
}

/** Where a dump should go, per the router/classifier. */
export type DumpCategory = "project" | "about-me" | "idea" | "unknown";

/** The router's decision for a single brain dump. */
export interface RoutingProposal {
  dumpId: string;
  category: DumpCategory;
  /** Matched project (when category is "project"), else null. */
  projectId: NoteId | null;
  /** Classifier confidence in [0, 1]. */
  confidence: number;
  /** Concise, scannable summary to file. */
  summary: string;
  /** The exact markdown block that would be appended. */
  entryMarkdown: string;
}

/**
 * Minimal LLM interface used to classify + summarize a dump. Implemented in
 * `@osb/memory-node` (OpenAI / Anthropic) — the engine stays provider-agnostic.
 */
export interface LlmClient {
  readonly model: string;
  complete(request: { system?: string; prompt: string }): Promise<string>;
}
