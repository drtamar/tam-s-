import { Modal, Notice, Plugin, Setting, TFile } from "obsidian";
import { resolveConfig, type MemoryConfig } from "@osb/core/config";
import {
  BrainDumpRouter,
  routerOptionsFromConfig,
  type BrainDump,
  type ProjectProfile,
  type RoutingProposal,
} from "@osb/core/projects";
import { createLlmClient } from "@osb/core/llm";
import { renderMemoryContext } from "@osb/core/memory";
import { ObsidianVaultReader } from "./ObsidianVaultReader.js";
import { loadCollectionsFromCache, stripFrontmatter } from "./loadFromCache.js";
import { DEFAULT_DATA, SecondBrainSettingTab, type PluginData } from "./settings.js";

export default class SecondBrainPlugin extends Plugin {
  data: PluginData = { ...DEFAULT_DATA };
  #reader!: ObsidianVaultReader;

  override async onload(): Promise<void> {
    this.data = { ...DEFAULT_DATA, ...((await this.loadData()) as PluginData | null) };
    this.#reader = new ObsidianVaultReader(this.app.vault);
    this.addSettingTab(new SecondBrainSettingTab(this.app, this));

    this.addCommand({
      id: "route-active-note",
      name: "Route current note as a brain dump",
      callback: () => void this.#routeActiveNote(),
    });
    this.addCommand({
      id: "process-inbox",
      name: "Process inbox",
      callback: () => void this.#processInbox(),
    });
    this.addCommand({
      id: "build-memory-loader",
      name: "Build memory loader (copy + save)",
      callback: () => void this.#buildMemoryLoader(),
    });
  }

  /** The resolved policy (saved partial merged over defaults). */
  config(): MemoryConfig {
    return resolveConfig(this.data.config);
  }

  async persist(): Promise<void> {
    await this.saveData(this.data);
  }

  #router(): BrainDumpRouter {
    const config = this.config();
    const llm = createLlmClient(config.llm.provider, {
      apiKey: this.data.apiKey,
      model: config.llm.model,
    });
    return new BrainDumpRouter(this.#reader, llm, routerOptionsFromConfig(config));
  }

  #collections(): Promise<ProjectProfile[]> {
    const config = this.config();
    return loadCollectionsFromCache(this.app, config.projectsFolder, config.areasFolder);
  }

  async #routeActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active note to route.");
      return;
    }
    const text = stripFrontmatter(await this.app.vault.cachedRead(file));
    await this.#routeDump({ id: file.path, text, source: file.path.replace(/\.md$/i, "") });
  }

  async #processInbox(): Promise<void> {
    const config = this.config();
    const prefix = config.inboxFolder.replace(/\/+$/, "") + "/";
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    if (files.length === 0) {
      new Notice(`Inbox '${config.inboxFolder}' is empty.`);
      return;
    }
    const router = this.#guardedRouter();
    if (!router) return;
    const collections = await this.#collections();
    let filed = 0;
    for (const f of files) {
      const text = stripFrontmatter(await this.app.vault.cachedRead(f));
      if (!text.trim()) continue;
      const proposal = await router.route(
        { id: f.path, text, source: f.path.replace(/\.md$/i, "") },
        collections,
      );
      if (config.autonomy === "auto") {
        if (await router.apply(proposal)) filed++;
      }
    }
    new Notice(
      config.autonomy === "auto"
        ? `Processed ${files.length} capture(s); filed ${filed}.`
        : `Routed ${files.length} capture(s). Set autonomy to 'auto' to file them, or route notes individually to confirm.`,
    );
  }

  async #routeDump(dump: BrainDump): Promise<void> {
    const router = this.#guardedRouter();
    if (!router) return;
    const collections = await this.#collections();
    const proposal = await router.route(dump, collections);

    if (this.config().autonomy === "auto") {
      await this.#applyAndNotify(router, proposal);
    } else {
      new ProposalModal(this, proposal, () => void this.#applyAndNotify(router, proposal)).open();
    }
  }

  async #applyAndNotify(router: BrainDumpRouter, proposal: RoutingProposal): Promise<void> {
    const written = await router.apply(proposal);
    new Notice(written ? `Filed into ${written}` : `Skipped (${proposal.category}, low confidence).`);
  }

  #guardedRouter(): BrainDumpRouter | null {
    if (!this.data.apiKey) {
      new Notice("Set your LLM API key in Second Brain settings first.");
      return null;
    }
    try {
      return this.#router();
    } catch (err) {
      new Notice(`Router error: ${(err as Error).message}`);
      return null;
    }
  }

  async #buildMemoryLoader(): Promise<void> {
    const config = this.config();
    const cols = await this.#collections();
    const aboutMe = await this.#readNote(config.aboutMeNote);
    const content = renderMemoryContext(config, {
      aboutMe,
      projects: cols.filter((c) => c.kind === "project").map((c) => ({ title: c.title, body: c.description })),
      areas: cols.filter((c) => c.kind === "area").map((c) => ({ title: c.title, body: c.description })),
    });
    await this.#reader.write(config.memoryLoaderNote, content);
    try {
      await navigator.clipboard.writeText(content);
      new Notice(`Memory loader saved to ${config.memoryLoaderNote} and copied to clipboard.`);
    } catch {
      new Notice(`Memory loader saved to ${config.memoryLoaderNote}.`);
    }
  }

  async #readNote(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return stripFrontmatter(await this.app.vault.cachedRead(file));
    return "";
  }
}

/** Confirmation modal shown when autonomy is "confirm". */
class ProposalModal extends Modal {
  constructor(
    plugin: SecondBrainPlugin,
    private readonly proposal: RoutingProposal,
    private readonly onApply: () => void,
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    const { contentEl, proposal } = this;
    const target =
      proposal.projectId ??
      (proposal.newNote ? `${proposal.newNote.kind}: ${proposal.newNote.title} (new)` : proposal.category);
    contentEl.createEl("h3", { text: "File this capture?" });
    contentEl.createEl("p", { text: `→ ${target}  ·  ${(proposal.confidence * 100) | 0}% confidence` });
    contentEl.createEl("pre", { text: proposal.summary });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("File it")
          .setCta()
          .onClick(() => {
            this.onApply();
            this.close();
          }),
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
