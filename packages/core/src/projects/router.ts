import type { VaultReader } from "../vault/VaultReader.js";
import type { NotePath } from "../vault/types.js";
import { appendUnderHeading } from "../util/markdown.js";
import { noteTitle } from "../util/ids.js";
import type {
  BrainDump,
  DumpCategory,
  LlmClient,
  ProjectProfile,
  RoutingProposal,
} from "./types.js";

export interface RouterOptions {
  /** Heading under which routed entries are appended. Default: `## Log`. */
  logHeading?: string;
  /** Note that receives personal ("about-me") captures. Default: `About Me.md`. */
  aboutMePath?: NotePath;
  /** Minimum confidence to auto-apply to a project. Default: 0.45. */
  minConfidence?: number;
}

const SYSTEM = `You are a routing assistant for a personal "second brain" vault.
You receive a brain dump and a list of projects. Decide where the dump belongs and
write a concise, scannable summary. Rules:
- Keep personal facts/identity ("About Me") SEPARATE from project updates.
- Prefer one project. If it is a new idea not tied to a project, category "idea".
- If it is purely personal, category "about-me". If unclear, category "unknown".
- Summary: 1-3 tight bullet points, no fluff, preserve concrete decisions/numbers.
Respond with ONLY a JSON object:
{"category":"project|about-me|idea|unknown","projectId":<id or null>,"confidence":0..1,"summary":"- ..."}`;

/**
 * The second memory management system: classifies a brain dump to a project (via
 * an {@link LlmClient}), summarizes it, and appends a dated, linked entry under
 * the matched project note. Distinct from the semantic recall memory — this one
 * actively organizes captures into the right project log.
 */
export class BrainDumpRouter {
  private readonly logHeading: string;
  private readonly aboutMePath: NotePath;
  private readonly minConfidence: number;

  constructor(
    private readonly vault: VaultReader,
    private readonly llm: LlmClient,
    options: RouterOptions = {},
  ) {
    this.logHeading = options.logHeading ?? "## Log";
    this.aboutMePath = options.aboutMePath ?? "About Me.md";
    this.minConfidence = options.minConfidence ?? 0.45;
  }

  /** Classify + summarize a dump into a {@link RoutingProposal} (no writes). */
  async route(
    dump: BrainDump,
    projects: ProjectProfile[],
  ): Promise<RoutingProposal> {
    const list = projects
      .map((p) => `- id: ${p.id}\n  title: ${p.title}\n  about: ${p.description}`)
      .join("\n");
    const prompt = `Projects:\n${list || "(none)"}\n\nBrain dump:\n"""\n${dump.text.trim()}\n"""`;

    const raw = await this.llm.complete({ system: SYSTEM, prompt });
    const parsed = parseDecision(raw);

    const category: DumpCategory = parsed.category ?? "unknown";
    let projectId = category === "project" ? parsed.projectId ?? null : null;
    // Guard against hallucinated ids.
    if (projectId && !projects.some((p) => p.id === projectId)) projectId = null;
    const confidence = clamp01(parsed.confidence ?? 0);
    const summary = (parsed.summary ?? "").trim() || "- (no summary)";

    return {
      dumpId: dump.id,
      category: projectId ? "project" : category === "project" ? "unknown" : category,
      projectId,
      confidence,
      summary,
      entryMarkdown: this.#entry(dump, summary),
    };
  }

  /**
   * Apply a proposal: append its entry under the log heading of the target note
   * (the project note, or the About Me note for personal captures). Returns the
   * path written, or null if the proposal was skipped.
   */
  async apply(proposal: RoutingProposal): Promise<NotePath | null> {
    let target: NotePath | null = null;
    if (proposal.category === "project" && proposal.projectId) {
      if (proposal.confidence < this.minConfidence) return null;
      target = `${proposal.projectId}.md`;
    } else if (proposal.category === "about-me") {
      target = this.aboutMePath;
    }
    if (!target) return null;

    const existing = (await this.vault.exists(target))
      ? await this.vault.read(target)
      : `# ${noteTitle(target)}\n`;
    const updated = appendUnderHeading(existing, this.logHeading, proposal.entryMarkdown);
    await this.vault.write(target, updated);
    return target;
  }

  #entry(dump: BrainDump, summary: string): string {
    const date = new Date().toISOString().slice(0, 10);
    const back = dump.source ? `\n\n> Source: [[${noteTitle(dump.source)}]]` : "";
    return `### ${date}\n\n${summary}${back}`;
  }
}

interface Decision {
  category?: DumpCategory;
  projectId?: string | null;
  confidence?: number;
  summary?: string;
}

/** Leniently extract the JSON decision object from an LLM response. */
function parseDecision(raw: string): Decision {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as Decision;
  } catch {
    return {};
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}
