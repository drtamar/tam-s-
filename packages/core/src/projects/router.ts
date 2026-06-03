import type { VaultReader } from "../vault/VaultReader.js";
import type { NoteId, NotePath } from "../vault/types.js";
import { appendUnderHeading } from "../util/markdown.js";
import { noteTitle } from "../util/ids.js";
import { slugify } from "../util/slugify.js";
import type { AutoCreate, MemoryConfig } from "../config/MemoryConfig.js";
import type {
  BrainDump,
  CollectionKind,
  DumpCategory,
  LlmClient,
  NewCollection,
  ProjectProfile,
  RoutingProposal,
} from "./types.js";

export interface RouterOptions {
  /** Heading under which routed entries are appended. Default: `## Log`. */
  logHeading?: string;
  /** Note that receives personal ("about-me") captures. Default: `About Me.md`. */
  aboutMePath?: NotePath;
  /** Minimum confidence to file into / create a collection. Default: 0.45. */
  minConfidence?: number;
  /** Folder for new project notes. Default: `Projects`. */
  projectsFolder?: string;
  /** Folder for new area notes. Default: `Areas`. */
  areasFolder?: string;
  /** Whether the router may create new project/area notes. Default: `propose`. */
  autoCreate?: AutoCreate;
  /** Extra guidance fed to the classifier. */
  classifierGuidance?: string;
  /** Desired summary shape. */
  summaryStyle?: string;
  /** Append a short "why filed here" line to each entry. */
  explainRouting?: boolean;
}

/** Derive {@link RouterOptions} from a full {@link MemoryConfig}. */
export function routerOptionsFromConfig(config: MemoryConfig): RouterOptions {
  return {
    logHeading: config.logHeading,
    aboutMePath: config.aboutMeNote,
    minConfidence: config.minConfidence,
    projectsFolder: config.projectsFolder,
    areasFolder: config.areasFolder,
    autoCreate: config.autoCreate,
    classifierGuidance: config.classifierGuidance,
    summaryStyle: config.summaryStyle,
    explainRouting: config.explainRouting,
  };
}

/**
 * The second memory management system: classifies a brain dump to the best
 * project or life-area (via an {@link LlmClient}), summarizes it, and appends a
 * dated, linked entry under the matched note's log heading — creating a new
 * project/area note when nothing fits (subject to `autoCreate`). Distinct from
 * the semantic recall memory: this one actively organizes captures.
 */
export class BrainDumpRouter {
  private readonly logHeading: string;
  private readonly aboutMePath: NotePath;
  private readonly minConfidence: number;
  private readonly projectsFolder: string;
  private readonly areasFolder: string;
  private readonly autoCreate: AutoCreate;
  private readonly classifierGuidance: string;
  private readonly summaryStyle: string;
  private readonly explainRouting: boolean;

  constructor(
    private readonly vault: VaultReader,
    private readonly llm: LlmClient,
    options: RouterOptions = {},
  ) {
    this.logHeading = options.logHeading ?? "## Log";
    this.aboutMePath = options.aboutMePath ?? "About Me.md";
    this.minConfidence = options.minConfidence ?? 0.45;
    this.projectsFolder = options.projectsFolder ?? "Projects";
    this.areasFolder = options.areasFolder ?? "Areas";
    this.autoCreate = options.autoCreate ?? "propose";
    this.classifierGuidance = options.classifierGuidance ?? "";
    this.summaryStyle =
      options.summaryStyle ?? "1-3 tight bullet points, no fluff; preserve concrete decisions/numbers";
    this.explainRouting = options.explainRouting ?? false;
  }

  #system(): string {
    return `You are a routing assistant for a personal "second brain" vault.
You receive a brain dump and a list of existing collections (projects and life areas).
Decide where the dump belongs and write a concise, scannable summary. Rules:
- Keep personal facts/identity ("about-me") SEPARATE from project/area updates.
- Projects are goal-bound; areas are ongoing parts of life (health, hobbies, relationships).
- Prefer an existing collection. If none fits but the dump is a coherent ongoing theme or effort,
  propose creating one: category "new-project" or "new-area" with a short title + description.
- If it is a loose idea tied to nothing, category "idea". If purely personal, "about-me".
  If unclear, "unknown".
${this.classifierGuidance ? `- Extra guidance: ${this.classifierGuidance}\n` : ""}- Summary style: ${this.summaryStyle}.
Respond with ONLY a JSON object:
{"category":"project|area|about-me|idea|new-project|new-area|unknown","projectId":<existing id or null>,"newTitle":<string or null>,"newDescription":<string or null>,"confidence":0..1,"summary":"- ...","reason":"<short why>"}`;
  }

  /** Classify + summarize a dump into a {@link RoutingProposal} (no writes). */
  async route(
    dump: BrainDump,
    collections: ProjectProfile[],
  ): Promise<RoutingProposal> {
    const list = collections
      .map((c) => `- id: ${c.id}\n  kind: ${c.kind}\n  title: ${c.title}\n  about: ${c.description}`)
      .join("\n");
    const prompt = `Collections:\n${list || "(none)"}\n\nBrain dump:\n"""\n${dump.text.trim()}\n"""`;

    const raw = await this.llm.complete({ system: this.#system(), prompt });
    const parsed = parseDecision(raw);

    const confidence = clamp01(parsed.confidence ?? 0);
    const summary = (parsed.summary ?? "").trim() || "- (no summary)";
    const reason = parsed.reason?.trim() || undefined;

    let category: DumpCategory = isCategory(parsed.category) ? parsed.category : "unknown";
    let projectId: NoteId | null = null;
    let newNote: NewCollection | undefined;

    if (category === "project" || category === "area") {
      const match = collections.find((c) => c.id === parsed.projectId);
      if (match) {
        projectId = match.id;
        category = match.kind; // trust the actual note's kind
      } else {
        category = "unknown"; // hallucinated id
      }
    } else if (category === "new-project" || category === "new-area") {
      const title = parsed.newTitle?.trim();
      if (title) {
        newNote = {
          title,
          kind: category === "new-area" ? "area" : "project",
          description: parsed.newDescription?.trim() || summary,
        };
      } else {
        category = "unknown";
      }
    }

    return {
      dumpId: dump.id,
      category,
      projectId,
      newNote,
      confidence,
      summary,
      reason,
      entryMarkdown: this.#entry(dump, summary, reason),
    };
  }

  /**
   * Apply a proposal by writing into the vault. Files into the matched note's
   * log, the About Me note, or a freshly-scaffolded project/area note (subject
   * to `autoCreate`). Returns the path written, or null if skipped.
   */
  async apply(proposal: RoutingProposal): Promise<NotePath | null> {
    if (
      (proposal.category === "project" || proposal.category === "area") &&
      proposal.projectId
    ) {
      if (proposal.confidence < this.minConfidence) return null;
      return this.#appendTo(`${proposal.projectId}.md`, proposal.entryMarkdown);
    }

    if (proposal.category === "about-me") {
      return this.#appendTo(this.aboutMePath, proposal.entryMarkdown);
    }

    if (
      (proposal.category === "new-project" || proposal.category === "new-area") &&
      proposal.newNote
    ) {
      if (this.autoCreate === "off") return null;
      if (proposal.confidence < this.minConfidence) return null;
      return this.#scaffold(proposal.newNote, proposal.entryMarkdown);
    }

    return null;
  }

  async #appendTo(target: NotePath, entry: string): Promise<NotePath> {
    const existing = (await this.vault.exists(target))
      ? await this.vault.read(target)
      : `# ${noteTitle(target)}\n`;
    await this.vault.write(target, appendUnderHeading(existing, this.logHeading, entry));
    return target;
  }

  /** Create a new project/area note (no gray-matter — keeps the router pure). */
  async #scaffold(note: NewCollection, entry: string): Promise<NotePath> {
    const folder = note.kind === "area" ? this.areasFolder : this.projectsFolder;
    const base = slugify(note.title) || "untitled";
    let path: NotePath = `${folder}/${base}.md`;
    let n = 1;
    while (await this.vault.exists(path)) {
      n += 1;
      path = `${folder}/${base}-${n}.md`;
    }
    const created = new Date().toISOString();
    const frontmatter = [
      "---",
      `title: ${note.title}`,
      `type: ${note.kind}`,
      "status: active",
      `created: ${created}`,
      "---",
    ].join("\n");
    const body = `${frontmatter}\n\n# ${note.title}\n\n${note.description}\n\n${this.logHeading}\n\n${entry.trim()}\n`;
    await this.vault.write(path, body);
    return path;
  }

  #entry(dump: BrainDump, summary: string, reason?: string): string {
    const date = new Date().toISOString().slice(0, 10);
    const back = dump.source ? `\n\n> Source: [[${noteTitle(dump.source)}]]` : "";
    const why = this.explainRouting && reason ? `\n\n_Why: ${reason}_` : "";
    return `### ${date}\n\n${summary}${why}${back}`;
  }
}

interface Decision {
  category?: string;
  projectId?: string | null;
  newTitle?: string | null;
  newDescription?: string | null;
  confidence?: number;
  summary?: string;
  reason?: string;
}

const CATEGORIES: ReadonlySet<string> = new Set<DumpCategory>([
  "project",
  "area",
  "about-me",
  "idea",
  "new-project",
  "new-area",
  "unknown",
]);

function isCategory(value: unknown): value is DumpCategory {
  return typeof value === "string" && CATEGORIES.has(value);
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

// Re-exported for callers building profiles.
export type { CollectionKind };
