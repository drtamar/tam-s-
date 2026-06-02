import {
  BrainDumpRouter,
  MemoryService,
  NodeVaultReader,
  createNote,
  dumpFromText,
  getBacklinks,
  loadProjects,
  loadVault,
  searchNotes,
  shortestPath,
  subgraph,
  type CreateNoteInput,
  type LoadedVault,
} from "@osb/core";
import {
  createEmbedder,
  createLlmClient,
  createVectorStore,
  type EmbedderKind,
  type LlmKind,
  type StoreKind,
} from "@osb/memory-node";

export interface VaultContextOptions {
  vaultDir: string;
  embedder?: EmbedderKind;
  store?: StoreKind;
  llm?: LlmKind;
  projectsFolder?: string;
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

  async listProjects() {
    const projects = await loadProjects(
      this.vault,
      this.#options.projectsFolder ?? "Projects",
    );
    return projects.map((p) => ({ id: p.id, title: p.title }));
  }

  /** Classify + summarize a brain dump to a project (dry-run proposal). */
  async routeBrainDump(text: string, source?: string) {
    const projects = await loadProjects(
      this.vault,
      this.#options.projectsFolder ?? "Projects",
    );
    const router = new BrainDumpRouter(this.vault, createLlmClient(this.#options.llm ?? "openai"));
    return router.route({ ...dumpFromText(text), source }, projects);
  }
}
