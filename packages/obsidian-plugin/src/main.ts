import { Modal, Notice, Platform, Plugin, Setting, TFile, requestUrl, type WorkspaceLeaf } from "obsidian";
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
import {
  ChatSession,
  DEFAULT_MODELS,
  FactStore,
  PROVIDER_LABELS,
  createProvider,
  type Http,
  type Provider,
  type SessionDeps,
} from "@osb/core/mem";
import {
  DriveRestBackend,
  GoogleSession,
  SyncEngine,
  pollDeviceLogin,
  startDeviceLogin,
  type DeviceCode,
} from "@osb/core/sync";
import { ObsidianVaultReader } from "./ObsidianVaultReader.js";
import { loadCollectionsFromCache, stripFrontmatter } from "./loadFromCache.js";
import { SecondBrainSettingTab, defaultData, type PluginData } from "./settings.js";
import { SecondBrainView, VIEW_TYPE } from "./views.js";

/**
 * HTTP via Obsidian's requestUrl: bypasses browser CORS (Anthropic and Google
 * reject plain cross-origin fetches from the app) and works the same on Android.
 */
export const obsidianHttp: Http = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method ?? "POST",
    headers: req.headers,
    body: req.body,
    throw: false,
  });
  return { status: res.status, text: res.text };
};

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export default class SecondBrainPlugin extends Plugin {
  data!: PluginData;
  reader!: ObsidianVaultReader;
  #syncing = false;
  #timer: number | undefined;
  #status: HTMLElement | undefined;

  override async onload(): Promise<void> {
    await this.#loadData();
    this.reader = new ObsidianVaultReader(this.app.vault);

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new SecondBrainView(leaf, this));
    this.addSettingTab(new SecondBrainSettingTab(this.app, this));
    this.addRibbonIcon("brain", "Second Brain", () => void this.openPanel());
    this.#status = this.addStatusBarItem();

    const cmd = (id: string, name: string, callback: () => void) => this.addCommand({ id, name, callback });
    cmd("open", "Open Second Brain", () => void this.openPanel("chat"));
    cmd("new-chat", "New chat", () => void this.openPanel("chat").then((v) => v?.newChat()));
    cmd("search-chats", "Search chats", () => void this.openPanel("history"));
    cmd("sync", "Sync with Google Drive now", () => void this.syncNow(true));
    cmd("sign-in", "Sign in to Google Drive", () => void this.signInGoogle());
    cmd("route-active-note", "Route current note as a brain dump", () => void this.#routeActiveNote());
    cmd("process-inbox", "Process inbox", () => void this.#processInbox());
    cmd("build-memory-loader", "Build memory loader (copy + save)", () => void this.#buildMemoryLoader());

    this.app.workspace.onLayoutReady(() => {
      this.scheduleSync();
      if (this.data.google.tokens) void this.syncNow(false);
    });
  }

  override onunload(): void {
    window.clearInterval(this.#timer);
  }

  // ------------------------------------------------------------------ data
  async #loadData(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as Partial<PluginData> & { apiKey?: string };
    const device = raw.device ?? `${Platform.isMobile ? "phone" : "pc"}-${Math.random().toString(36).slice(2, 6)}`;
    const base = defaultData(device);
    this.data = {
      ...base,
      ...raw,
      keys: { ...base.keys, ...raw.keys },
      models: { ...base.models, ...raw.models },
      google: { ...base.google, ...raw.google },
      sync: { ...base.sync, ...raw.sync },
      agents: raw.agents?.length ? raw.agents : base.agents,
      device,
    };
    // v1 stored a single router key; carry it over to the matching provider.
    if (raw.apiKey) {
      const p: Provider = this.data.config.llm?.provider === "anthropic" ? "claude" : "openai";
      this.data.keys[p] ??= raw.apiKey;
    }
    await this.persist();
  }

  config(): MemoryConfig {
    return resolveConfig(this.data.config);
  }

  async persist(): Promise<void> {
    await this.saveData(this.data);
  }

  // ------------------------------------------------------------------ chat
  facts(): FactStore {
    return new FactStore(this.reader, this.data.device);
  }

  deps(provider: Provider, agentName: string): SessionDeps {
    const key = this.data.keys[provider];
    if (!key) throw new Error(`Add your ${PROVIDER_LABELS[provider]} API key in Second Brain settings.`);
    const agent = this.data.agents.find((a) => a.name === agentName) ?? this.data.agents[0]!;
    return {
      vault: this.reader,
      facts: this.facts(),
      provider: createProvider(provider, key, obsidianHttp),
      model: this.data.models[provider] || DEFAULT_MODELS[provider],
      agent,
      packBudget: this.data.chatTokens,
    };
  }

  newSession(): ChatSession {
    return new ChatSession(this.deps(this.data.provider, this.data.agent));
  }

  async openPanel(tab?: "chat" | "history"): Promise<SecondBrainView | undefined> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return undefined;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof SecondBrainView) {
      if (tab) view.show(tab);
      return view;
    }
    return undefined;
  }

  // ------------------------------------------------------------------ sync
  #syncInclude(): string[] {
    const c = this.config();
    const extra = this.data.sync.extraFolders.split(",").map((s) => s.trim()).filter(Boolean);
    return [...new Set(["memory", "Chats", c.aboutMeNote, c.projectsFolder, c.areasFolder, c.memoryLoaderNote, ...extra])];
  }

  scheduleSync(): void {
    window.clearInterval(this.#timer);
    const m = this.data.sync.minutes;
    if (m > 0) {
      this.#timer = window.setInterval(() => void this.syncNow(false), m * 60_000);
      this.registerInterval(this.#timer);
    }
  }

  async syncNow(manual: boolean): Promise<void> {
    const g = this.data.google;
    if (!g.tokens) {
      if (manual) new Notice("Sign in to Google Drive first (Settings → Second Brain).");
      return;
    }
    if (this.#syncing) return;
    this.#syncing = true;
    this.#status?.setText("Second Brain: syncing…");
    try {
      const auth = new GoogleSession(obsidianHttp, { clientId: g.clientId, clientSecret: g.clientSecret }, g.tokens, async (t) => {
        g.tokens = t;
        await this.persist();
      });
      const engine = new SyncEngine(this.reader, new DriveRestBackend(obsidianHttp, auth), this.data.sync.manifest, {
        include: this.#syncInclude(),
      });
      const r = await engine.run();
      this.data.sync.last = new Date().toLocaleString();
      await this.persist();
      this.#status?.setText(`Second Brain: synced ${new Date().toLocaleTimeString()}`);
      const changed = r.uploaded.length + r.downloaded.length;
      if (r.conflicts.length) new Notice(`Synced, but ${r.conflicts.length} file(s) were edited on two devices. Your version was kept; the other is saved as *.conflict-*.`, 10000);
      else if (manual || changed) new Notice(`Synced: ${r.uploaded.length} up, ${r.downloaded.length} down.`);
    } catch (e) {
      this.#status?.setText("Second Brain: sync failed");
      new Notice(`Sync failed: ${(e as Error).message}`, 8000);
    } finally {
      this.#syncing = false;
    }
  }

  async signInGoogle(): Promise<void> {
    const { clientId, clientSecret } = this.data.google;
    if (!clientId || !clientSecret) return void new Notice("Paste your Google client ID and secret in settings first.");
    try {
      const client = { clientId, clientSecret };
      const code = await startDeviceLogin(obsidianHttp, client);
      const modal = new DeviceLoginModal(this.app, code);
      modal.open();
      const tokens = await pollDeviceLogin(obsidianHttp, client, code, async (ms) => {
        await sleep(ms);
        if (modal.cancelled) throw new Error("Sign-in cancelled.");
      });
      modal.finish();
      this.data.google.tokens = tokens;
      await this.persist();
      new Notice("Signed in to Google Drive.");
      void this.syncNow(true);
    } catch (e) {
      new Notice((e as Error).message, 8000);
    }
  }

  // --------------------------------------------------- brain-dump router
  #router(): BrainDumpRouter {
    const config = this.config();
    const key = config.llm.provider === "anthropic" ? this.data.keys.claude : this.data.keys.openai;
    if (!key) throw new Error(`Add your ${config.llm.provider === "anthropic" ? "Claude" : "OpenAI"} API key in settings.`);
    const llm = createLlmClient(config.llm.provider, { apiKey: key, model: config.llm.model });
    return new BrainDumpRouter(this.reader, llm, routerOptionsFromConfig(config));
  }

  #collections(): Promise<ProjectProfile[]> {
    const config = this.config();
    return loadCollectionsFromCache(this.app, config.projectsFolder, config.areasFolder);
  }

  async #routeActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return void new Notice("No active note to route.");
    const text = stripFrontmatter(await this.app.vault.cachedRead(file));
    await this.#routeDump({ id: file.path, text, source: file.path.replace(/\.md$/i, "") });
  }

  async #processInbox(): Promise<void> {
    const config = this.config();
    const prefix = config.inboxFolder.replace(/\/+$/, "") + "/";
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    if (files.length === 0) return void new Notice(`Inbox '${config.inboxFolder}' is empty.`);
    const router = this.#guardedRouter();
    if (!router) return;
    const collections = await this.#collections();
    let filed = 0;
    for (const f of files) {
      const text = stripFrontmatter(await this.app.vault.cachedRead(f));
      if (!text.trim()) continue;
      const proposal = await router.route({ id: f.path, text, source: f.path.replace(/\.md$/i, "") }, collections);
      if (config.autonomy === "auto" && (await router.apply(proposal))) filed++;
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
    const proposal = await router.route(dump, await this.#collections());
    if (this.config().autonomy === "auto") await this.#applyAndNotify(router, proposal);
    else new ProposalModal(this, proposal, () => void this.#applyAndNotify(router, proposal)).open();
  }

  async #applyAndNotify(router: BrainDumpRouter, proposal: RoutingProposal): Promise<void> {
    const written = await router.apply(proposal);
    new Notice(written ? `Filed into ${written}` : `Skipped (${proposal.category}, low confidence).`);
  }

  #guardedRouter(): BrainDumpRouter | null {
    try {
      return this.#router();
    } catch (err) {
      new Notice((err as Error).message);
      return null;
    }
  }

  async #buildMemoryLoader(): Promise<void> {
    const config = this.config();
    const cols = await this.#collections();
    const file = this.app.vault.getAbstractFileByPath(config.aboutMeNote);
    const aboutMe = file instanceof TFile ? stripFrontmatter(await this.app.vault.cachedRead(file)) : "";
    const content = renderMemoryContext(config, {
      aboutMe,
      projects: cols.filter((c) => c.kind === "project").map((c) => ({ title: c.title, body: c.description })),
      areas: cols.filter((c) => c.kind === "area").map((c) => ({ title: c.title, body: c.description })),
    });
    await this.reader.write(config.memoryLoaderNote, content);
    try {
      await navigator.clipboard.writeText(content);
      new Notice(`Memory loader saved to ${config.memoryLoaderNote} and copied to clipboard.`);
    } catch {
      new Notice(`Memory loader saved to ${config.memoryLoaderNote}.`);
    }
  }
}

/** Shows the code the user types at google.com/device. */
class DeviceLoginModal extends Modal {
  cancelled = false;
  #done = false;
  constructor(app: Modal["app"], private readonly code: DeviceCode) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Sign in to Google" });
    contentEl.createEl("p", { text: `1. Open ${this.code.verificationUrl} on any device.` });
    contentEl.createEl("p", { text: "2. Enter this code:" });
    contentEl.createEl("div", { text: this.code.userCode, cls: "osb-code" });
    contentEl.createEl("p", { text: "This window closes by itself once you approve.", cls: "setting-item-description" });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Open page").setCta().onClick(() => window.open(this.code.verificationUrl)))
      .addButton((b) => b.setButtonText("Copy code").onClick(() => void navigator.clipboard.writeText(this.code.userCode)));
  }

  finish(): void {
    this.#done = true;
    this.close();
  }

  override onClose(): void {
    if (!this.#done) this.cancelled = true;
    this.contentEl.empty();
  }
}

/** Confirmation modal shown when autonomy is "confirm". */
class ProposalModal extends Modal {
  constructor(plugin: SecondBrainPlugin, private readonly proposal: RoutingProposal, private readonly onApply: () => void) {
    super(plugin.app);
  }

  override onOpen(): void {
    const { contentEl, proposal } = this;
    const target = proposal.projectId ?? (proposal.newNote ? `${proposal.newNote.kind}: ${proposal.newNote.title} (new)` : proposal.category);
    contentEl.createEl("h3", { text: "File this capture?" });
    contentEl.createEl("p", { text: `→ ${target}  ·  ${(proposal.confidence * 100) | 0}% confidence` });
    contentEl.createEl("pre", { text: proposal.summary });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("File it").setCta().onClick(() => { this.onApply(); this.close(); }))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
