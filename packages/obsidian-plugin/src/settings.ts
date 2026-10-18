import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type { MemoryConfig } from "@osb/core/config";
import { DEFAULT_MODELS, PROVIDER_LABELS, type AgentProfile, type Provider } from "@osb/core/mem";
import type { Manifest, StoredTokens } from "@osb/core/sync";
import type SecondBrainPlugin from "./main.js";

export const PROVIDERS: Provider[] = ["claude", "openai", "gemini", "grok"];

/** Persisted plugin data. Keys live only in this vault's plugin data file. */
export interface PluginData {
  config: Partial<MemoryConfig>;
  keys: Partial<Record<Provider, string>>;
  models: Partial<Record<Provider, string>>;
  agents: AgentProfile[];
  provider: Provider;
  agent: string;
  /** Max tokens of memory injected into each chat turn. */
  chatTokens: number;
  /** Unique per device — names this device's memory file (memory/<device>.jsonl). */
  device: string;
  google: { clientId: string; clientSecret: string; tokens?: StoredTokens };
  sync: { extraFolders: string; minutes: number; manifest: Manifest; last?: string };
}

export const DEFAULT_AGENTS: AgentProfile[] = [
  { name: "Assistant", prompt: "You are a helpful, direct assistant. Keep answers short and scannable. Never make the user repeat themselves." },
  { name: "Organizer", prompt: "You help the user organize their life into projects and areas. Propose clear next steps; keep lists short." },
  { name: "Coach", prompt: "You are a calm focus coach for someone with ADD. One small next step at a time. No guilt." },
];

export function defaultData(device: string): PluginData {
  return {
    config: {},
    keys: {},
    models: {},
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    provider: "claude",
    agent: "Assistant",
    chatTokens: 600,
    device,
    google: { clientId: "", clientSecret: "" },
    sync: { extraFolders: "", minutes: 10, manifest: {} },
  };
}

export class SecondBrainSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SecondBrainPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const d = this.plugin.data;
    const save = () => void this.plugin.persist();

    // ---- Providers -----------------------------------------------------
    containerEl.createEl("h2", { text: "AI providers" });
    containerEl.createEl("p", {
      text: "Chats use your own API keys (pay-per-use). Keys are stored only in this vault's plugin data.",
      cls: "setting-item-description",
    });
    for (const p of PROVIDERS) {
      new Setting(containerEl)
        .setName(PROVIDER_LABELS[p])
        .addText((t) => {
          t.inputEl.type = "password";
          t.setPlaceholder("API key").setValue(d.keys[p] ?? "").onChange((v) => {
            d.keys[p] = v.trim();
            save();
          });
        })
        .addText((t) =>
          t.setPlaceholder(DEFAULT_MODELS[p]).setValue(d.models[p] ?? "").onChange((v) => {
            d.models[p] = v.trim() || undefined;
            save();
          }),
        );
    }
    containerEl.createEl("p", { text: "Right-hand box = model name. Leave empty for the default; model names change, so edit freely.", cls: "setting-item-description" });

    new Setting(containerEl)
      .setName("Memory tokens per chat turn")
      .setDesc("How much shared memory is added to each message. Lower = cheaper.")
      .addText((t) => t.setValue(String(d.chatTokens)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 100) { d.chatTokens = Math.round(n); save(); }
      }));

    // ---- Agents --------------------------------------------------------
    containerEl.createEl("h2", { text: "Agents" });
    containerEl.createEl("p", { text: "An agent is a name, an instruction, and an optional project whose memory it always sees.", cls: "setting-item-description" });
    d.agents.forEach((a, i) => {
      new Setting(containerEl)
        .setName(a.name || "Agent")
        .addText((t) => t.setPlaceholder("Name").setValue(a.name).onChange((v) => { a.name = v; save(); }))
        .addText((t) => t.setPlaceholder("Project (e.g. Projects/Vetos)").setValue(a.project ?? "").onChange((v) => { a.project = v.trim() || undefined; save(); }))
        .addExtraButton((b) =>
          b.setIcon("trash").setTooltip("Delete agent").onClick(() => {
            if (d.agents.length <= 1) return new Notice("Keep at least one agent.");
            d.agents.splice(i, 1);
            if (!d.agents.some((x) => x.name === d.agent)) d.agent = d.agents[0]!.name;
            save();
            this.display();
          }),
        );
      new Setting(containerEl).addTextArea((t) => {
        t.setPlaceholder("Instruction").setValue(a.prompt).onChange((v) => { a.prompt = v; save(); });
        t.inputEl.rows = 3;
      });
    });
    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add agent").onClick(() => {
        d.agents.push({ name: "New agent", prompt: "You are a helpful assistant." });
        save();
        this.display();
      }),
    );

    // ---- Google Drive --------------------------------------------------
    containerEl.createEl("h2", { text: "Google Drive sync" });
    const signedIn = !!d.google.tokens;
    containerEl.createEl("p", {
      text: "Syncs memory, chats and your key notes into a 'Second Brain' folder in your Drive so phone and PC share one memory. Setup (once): in Google Cloud Console create an OAuth client of type 'TV and Limited Input devices', enable the Drive API, and paste its ID and secret here. See docs/obsidian-setup.md.",
      cls: "setting-item-description",
    });
    new Setting(containerEl).setName("Client ID").addText((t) => t.setValue(d.google.clientId).onChange((v) => { d.google.clientId = v.trim(); save(); }));
    new Setting(containerEl).setName("Client secret").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(d.google.clientSecret).onChange((v) => { d.google.clientSecret = v.trim(); save(); });
    });
    new Setting(containerEl)
      .setName(signedIn ? "Signed in to Google" : "Not signed in")
      .setDesc(d.sync.last ? `Last sync: ${d.sync.last}` : "Never synced")
      .addButton((b) => b.setButtonText(signedIn ? "Sign in again" : "Sign in").onClick(() => void this.plugin.signInGoogle().then(() => this.display())))
      .addButton((b) => b.setButtonText("Sync now").setCta().onClick(() => void this.plugin.syncNow(true).then(() => this.display())));
    new Setting(containerEl)
      .setName("Auto-sync every (minutes)")
      .setDesc("0 = manual only.")
      .addText((t) => t.setValue(String(d.sync.minutes)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) { d.sync.minutes = n; save(); this.plugin.scheduleSync(); }
      }));
    new Setting(containerEl)
      .setName("Extra folders to sync")
      .setDesc("Comma-separated, in addition to memory, Chats, your projects/areas and About Me.")
      .addText((t) => t.setPlaceholder("Ideas, Journal").setValue(d.sync.extraFolders).onChange((v) => { d.sync.extraFolders = v; save(); }));
    new Setting(containerEl).setName("This device's name").setDesc("Names this device's memory file. Don't change after first use.").addText((t) => t.setValue(d.device).setDisabled(true));

    // ---- Memory policy -------------------------------------------------
    this.#policy(containerEl);
  }

  #policy(containerEl: HTMLElement): void {
    const cfg = this.plugin.config();
    const set = <K extends keyof MemoryConfig>(key: K, value: MemoryConfig[K]) => {
      this.plugin.data.config[key] = value;
      void this.plugin.persist();
    };
    const text = (name: string, desc: string, key: keyof MemoryConfig, placeholder = "") =>
      new Setting(containerEl).setName(name).setDesc(desc).addText((t) =>
        t.setPlaceholder(placeholder).setValue(String(cfg[key] ?? "")).onChange((v) => set(key, v as never)),
      );

    containerEl.createEl("h2", { text: "Memory policy — what" });
    text("Projects folder", "Goal-bound projects.", "projectsFolder", "Projects");
    text("Areas folder", "Ongoing life areas / hobbies.", "areasFolder", "Areas");
    text("About Me note", "Where personal facts are filed.", "aboutMeNote", "About Me.md");
    text("Inbox folder", "Quick captures to route.", "inboxFolder", "Inbox");
    text("Memory loader note", "Portable digest for other LLMs.", "memoryLoaderNote", "Master Memory Loader.md");
    new Setting(containerEl).setName("Classifier guidance").setDesc("Tell the router what belongs where.").addTextArea((t) =>
      t.setValue(cfg.classifierGuidance).onChange((v) => set("classifierGuidance", v)),
    );

    containerEl.createEl("h2", { text: "Memory policy — how" });
    text("Log heading", "Heading routed entries are appended under.", "logHeading", "## Log");
    new Setting(containerEl).setName("Autonomy").setDesc("Apply routing automatically, or confirm first.").addDropdown((d) =>
      d.addOptions({ confirm: "Confirm first", auto: "Apply automatically" }).setValue(cfg.autonomy).onChange((v) => set("autonomy", v as MemoryConfig["autonomy"])),
    );
    new Setting(containerEl).setName("Auto-create collections").setDesc("May new projects/areas be created?").addDropdown((d) =>
      d.addOptions({ off: "Never", propose: "Propose", auto: "Create automatically" }).setValue(cfg.autoCreate).onChange((v) => set("autoCreate", v as MemoryConfig["autoCreate"])),
    );
    new Setting(containerEl).setName("Minimum confidence").setDesc("0–1.").addText((t) =>
      t.setValue(String(cfg.minConfidence)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n)) set("minConfidence", Math.max(0, Math.min(1, n)));
      }),
    );
    new Setting(containerEl).setName("Explain routing").setDesc("Add a 'why filed here' line.").addToggle((t) =>
      t.setValue(cfg.explainRouting).onChange((v) => set("explainRouting", v)),
    );

    containerEl.createEl("h2", { text: "Memory policy — why" });
    new Setting(containerEl).setName("Purpose").setDesc("The intent of this second brain.").addTextArea((t) =>
      t.setValue(cfg.purpose).onChange((v) => set("purpose", v)),
    );
  }
}
