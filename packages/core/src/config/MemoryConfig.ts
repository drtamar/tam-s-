import type { NotePath } from "../vault/types.js";

export type Autonomy = "auto" | "confirm";
export type AutoCreate = "off" | "propose" | "auto";
export type LlmProvider = "openai" | "anthropic";

/**
 * The "what / how / why" memory-management policy that governs how Claude (or
 * the Obsidian plugin / CLI) organizes the vault. Pure data — surfaced as the
 * Obsidian settings tab and as `<vault>/.osb/config.json` for the MCP/CLI.
 */
export interface MemoryConfig {
  // -- what --------------------------------------------------------------
  /** Folder of goal-bound project notes. */
  projectsFolder: string;
  /** Folder of ongoing life areas / hobbies (PARA-style, not goal-bound). */
  areasFolder: string;
  /** Note that receives personal ("About Me") captures. */
  aboutMeNote: NotePath;
  /** Folder of quick captures to route. */
  inboxFolder: string;
  /** Generated index of projects + areas. */
  indexNote: NotePath;
  /** Portable, LLM-agnostic memory digest other LLMs can load. */
  memoryLoaderNote: NotePath;
  /** Free text telling the classifier what belongs where. */
  classifierGuidance: string;

  // -- how ---------------------------------------------------------------
  /** Heading under which routed entries are appended. */
  logHeading: string;
  /** Whether changes apply automatically or are proposed for confirmation. */
  autonomy: Autonomy;
  /** Whether Claude may create new project/area notes. */
  autoCreate: AutoCreate;
  /** Minimum classifier confidence to file into an existing collection. */
  minConfidence: number;
  /** Guidance on summary shape, e.g. "1–3 scannable bullets". */
  summaryStyle: string;
  /** Append a short "why filed here" line to each routed entry. */
  explainRouting: boolean;
  /** Approximate size cap (in tokens) for the portable memory loader. */
  contextTokenBudget: number;

  // -- why ---------------------------------------------------------------
  /** Free-text purpose/rationale for the whole system. */
  purpose: string;

  // -- llm / drive -------------------------------------------------------
  llm: { provider: LlmProvider; model?: string };
  drive: { rootFolderId?: string; serviceAccountPath?: string };
}

/** A fully-populated default config matching the user's existing vault habits. */
export function defaultConfig(): MemoryConfig {
  return {
    projectsFolder: "Projects",
    areasFolder: "Areas",
    aboutMeNote: "About Me.md",
    inboxFolder: "Inbox",
    indexNote: "Projects Index.md",
    memoryLoaderNote: "Master Memory Loader.md",
    classifierGuidance:
      "Projects are goal-bound efforts with an outcome. Areas are ongoing parts of life (health, hobbies, relationships) with no end state. Keep personal identity facts in About Me, separate from project/area updates. Loose ideas not tied to anything are 'idea'.",
    logHeading: "## Log",
    autonomy: "confirm",
    autoCreate: "propose",
    minConfidence: 0.45,
    summaryStyle: "1–3 tight, scannable bullet points; preserve concrete decisions and numbers",
    explainRouting: false,
    contextTokenBudget: 2000,
    purpose:
      "A unified second brain: organize captures into projects and life areas, and maintain a portable memory any LLM can load.",
    llm: { provider: "openai" },
    drive: {},
  };
}

/** Merge a partial config over the defaults (nested `llm`/`drive` merged too). */
export function resolveConfig(partial: Partial<MemoryConfig> = {}): MemoryConfig {
  const base = defaultConfig();
  return {
    ...base,
    ...partial,
    llm: { ...base.llm, ...(partial.llm ?? {}) },
    drive: { ...base.drive, ...(partial.drive ?? {}) },
  };
}
