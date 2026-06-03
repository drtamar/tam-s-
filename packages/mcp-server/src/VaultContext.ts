import {
  BrainDumpRouter,
  MemoryService,
  NodeVaultReader,
  appendUnderHeading,
  buildMemoryContext,
  createNote,
  dumpFromText,
  getBacklinks,
  loadCollections,
  loadVault,
  noteTitle,
  organizeVault,
  routerOptionsFromConfig,
  searchNotes,
  shortestPath,
  subgraph,
  type CreateNoteInput,
  type LoadedVault,
  type MemoryConfig,
  type NotePath,
} from "@osb/core";
import {
  createEmbedder,
  createLlmClient,
  createVectorStore,
  loadMemoryConfig,
  saveMemoryConfig,
  type EmbedderKind,
  type StoreKind,
} from "@osb/memory-node";

export interface VaultContextOptions {
  vaultDir: string;
  embedder?: EmbedderKind;
  store?: StoreKind;
}

/**
 * Shared backend the MCP tools delegate to. Keeps a cached graph (invalidated on
 * writes) and a lazily-built {@link MemoryService}, so it is independent of the
 * MCP SDK and can be unit-tested directly.
 */
export class VaultContext {
  readonly vault: NodeVaultReader;
  #loaded: Promise<LoadedVault> | undefined;
  #memory: MemoryService | undefined;
  #config: Promise<MemoryConfig> | undefined;
  readonly #options: VaultContextOptions;

  constructor(options: VaultContextOptions) {
    this.#options = options;
    this.vault = new NodeVaultReader(options.vaultDir);
  }

  graph(): Promise<LoadedVault> {
    if (!this.#loaded) this.#loaded = loadVault(this.vault);
    return this.#loaded;
  }

  memory(): MemoryService {
    if (!this.#memory) {
      const embedder = createEmbedder(this.#options.embedder ?? "local");
      const store = createVectorStore(
        this.#options.store ?? "json",
        this.#options.vaultDir,
        embedder,
      );
      this.#memory = new MemoryService(this.vault, embedder, store);
    }
    return this.#memory;
  }

  #invalidate(): void {
    this.#loaded = undefined;
  }

  async getNote(id: string): Promise<{
    id: string;
    path: string;
    title: string;
    tags: string[];
    links: string[];
    body: string;
  } | null> {
    const loaded = await this.graph();
    const note = loaded.byId.get(id);
    if (!note) return null;
    return {
      id: note.id,
      path: note.path,
      title: note.title,
      tags: note.tags,
      links: note.links.map((l) => l.target),
      body: note.body,
    };
  }

  async backlinks(id: string) {
    const loaded = await this.graph();
    return getBacklinks(loaded.graph, id);
  }

  async search(query: string, limit = 20) {
    const loaded = await this.graph();
    return searchNotes(loaded.notes, query, limit).map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tags,
    }));
  }

  async semanticSearch(query: string, k = 5) {
    return this.memory().recall(query, k);
  }

  async queryGraph(id: string, depth = 1) {
    const loaded = await this.graph();
    return {
      neighbors: subgraph(loaded.graph, id, depth),
      backlinks: getBacklinks(loaded.graph, id).map((b) => b.from),
    };
  }

  async pathBetween(from: string, to: string) {
    const loaded = await this.graph();
    return shortestPath(loaded.graph, from, to);
  }

  async createNote(input: CreateNoteInput) {
    const result = await createNote(this.vault, input);
    this.#invalidate();
    return result;
  }

  /** The "what / how / why" policy from `<vault>/.osb/config.json`. */
  config(): Promise<MemoryConfig> {
    if (!this.#config) this.#config = loadMemoryConfig(this.#options.vaultDir);
    return this.#config;
  }

  async listProjects() {
    const config = await this.config();
    const collections = await loadCollections(
      this.vault,
      config.projectsFolder,
      config.areasFolder,
    );
    return collections.map((c) => ({ id: c.id, title: c.title, kind: c.kind }));
  }

  /** Classify + summarize a brain dump to a project/area (dry-run proposal). */
  async routeBrainDump(text: string, source?: string) {
    const config = await this.config();
    const collections = await loadCollections(
      this.vault,
      config.projectsFolder,
      config.areasFolder,
    );
    const router = new BrainDumpRouter(
      this.vault,
      createLlmClient(config.llm.provider),
      routerOptionsFromConfig(config),
    );
    return router.route({ ...dumpFromText(text), source }, collections);
  }

  /** Append a dated entry under a heading in a note (Claude-driven write). */
  async appendToNote(path: NotePath, text: string, heading?: string): Promise<NotePath> {
    const config = await this.config();
    const head = heading ?? config.logHeading;
    const existing = (await this.vault.exists(path))
      ? await this.vault.read(path)
      : `# ${noteTitle(path)}\n`;
    await this.vault.write(path, appendUnderHeading(existing, head, text.trim()));
    this.#invalidate();
    return path;
  }

  /**
   * File a brain dump that Claude has already classified + summarized: appends a
   * dated entry (with optional source backlink) under the target note's log.
   */
  async fileBrainDump(args: {
    summary: string;
    projectId: string;
    source?: string;
  }): Promise<NotePath> {
    const date = new Date().toISOString().slice(0, 10);
    const back = args.source ? `\n\n> Source: [[${noteTitle(args.source)}]]` : "";
    const entry = `### ${date}\n\n${args.summary.trim()}${back}`;
    return this.appendToNote(`${args.projectId}.md`, entry);
  }

  /** The portable, LLM-agnostic memory loader assembled from the vault. */
  async getMemoryContext(): Promise<string> {
    return buildMemoryContext(this.vault, await this.config());
  }

  /** Full-vault review/organize pass. With `apply`, writes routing + loader. */
  async reviewVault(apply = false) {
    const config = await this.config();
    let llm;
    try {
      llm = createLlmClient(config.llm.provider);
    } catch {
      llm = undefined; // no API key — skip routing, still report + build loader
    }
    const report = await organizeVault(this.vault, { config, llm, apply });
    if (apply) this.#invalidate();
    return report;
  }

  async getConfig(): Promise<MemoryConfig> {
    return this.config();
  }

  async setConfig(partial: Partial<MemoryConfig>): Promise<MemoryConfig> {
    const merged = await saveMemoryConfig(this.#options.vaultDir, partial);
    this.#config = Promise.resolve(merged);
    return merged;
  }
}
