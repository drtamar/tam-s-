import type { NoteId, NotePath } from "../vault/types.js";

/** Whether a collection note is a goal-bound project or an ongoing life area. */
export type CollectionKind = "project" | "area";

/** A project or area the second memory system can route brain dumps into. */
export interface ProjectProfile {
  id: NoteId;
  path: NotePath;
  title: string;
  /** Short description used to classify dumps (from the note body / index). */
  description: string;
  /** Project (goal-bound) or area (ongoing). Defaults to "project". */
  kind: CollectionKind;
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
export type DumpCategory =
  | "project"
  | "area"
  | "about-me"
  | "idea"
  | "new-project"
  | "new-area"
  | "unknown";

/** A new collection the classifier proposes creating. */
export interface NewCollection {
  title: string;
  kind: CollectionKind;
  description: string;
}

/** The router's decision for a single brain dump. */
export interface RoutingProposal {
  dumpId: string;
  category: DumpCategory;
  /** Matched collection (project or area) when category is "project"/"area". */
  projectId: NoteId | null;
  /** Proposed new collection when category is "new-project"/"new-area". */
  newNote?: NewCollection;
  /** Classifier confidence in [0, 1]. */
  confidence: number;
  /** Concise, scannable summary to file. */
  summary: string;
  /** Optional short rationale (filed when `explainRouting` is on). */
  reason?: string;
  /** The exact markdown block that would be appended. */
  entryMarkdown: string;
}

/**
 * Minimal LLM interface used to classify + summarize a dump. Implemented in
 * `@osb/core/llm` (OpenAI / Anthropic) — the engine stays provider-agnostic.
 */
export interface LlmClient {
  readonly model: string;
  complete(request: { system?: string; prompt: string }): Promise<string>;
}
