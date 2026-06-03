import { PluginSettingTab, Setting, type App } from "obsidian";
import type { MemoryConfig } from "@osb/core/config";
import type SecondBrainPlugin from "./main.js";

/** Persisted plugin data: a partial policy (merged over defaults) + the API key. */
export interface PluginData {
  config: Partial<MemoryConfig>;
  apiKey: string;
}

export const DEFAULT_DATA: PluginData = { config: {}, apiKey: "" };

/** The "what / how / why" settings tab, backed by {@link MemoryConfig}. */
export class SecondBrainSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SecondBrainPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const cfg = this.plugin.config();
    const set = <K extends keyof MemoryConfig>(key: K, value: MemoryConfig[K]) => {
      this.plugin.data.config[key] = value;
    };
    const save = () => void this.plugin.persist();

    // ---- WHAT ----------------------------------------------------------
    containerEl.createEl("h2", { text: "What — where memory lives" });
    const text = (
      name: string,
      desc: string,
      key: keyof MemoryConfig,
      placeholder = "",
    ) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t
            .setPlaceholder(placeholder)
            .setValue(String(cfg[key] ?? ""))
            .onChange((v) => {
              set(key, v as never);
              save();
            }),
        );

    text("Projects folder", "Goal-bound projects.", "projectsFolder", "Projects");
    text("Areas folder", "Ongoing life areas / hobbies.", "areasFolder", "Areas");
    text("About Me note", "Where personal facts are filed.", "aboutMeNote", "About Me.md");
    text("Inbox folder", "Quick captures to route.", "inboxFolder", "Inbox");
    text("Memory loader note", "Portable digest for other LLMs.", "memoryLoaderNote", "Master Memory Loader.md");
    new Setting(containerEl)
      .setName("Classifier guidance")
      .setDesc("Tell the classifier what belongs where.")
      .addTextArea((t) =>
        t.setValue(cfg.classifierGuidance).onChange((v) => {
          set("classifierGuidance", v);
          save();
        }),
      );

    // ---- HOW -----------------------------------------------------------
    containerEl.createEl("h2", { text: "How — behavior" });
    text("Log heading", "Heading routed entries are appended under.", "logHeading", "## Log");
    new Setting(containerEl)
      .setName("Autonomy")
      .setDesc("Apply changes automatically, or propose for confirmation.")
      .addDropdown((d) =>
        d
          .addOptions({ confirm: "Confirm first", auto: "Apply automatically" })
          .setValue(cfg.autonomy)
          .onChange((v) => {
            set("autonomy", v as MemoryConfig["autonomy"]);
            save();
          }),
      );
    new Setting(containerEl)
      .setName("Auto-create collections")
      .setDesc("Whether new projects/areas may be created automatically.")
      .addDropdown((d) =>
        d
          .addOptions({ off: "Never", propose: "Propose", auto: "Create automatically" })
          .setValue(cfg.autoCreate)
          .onChange((v) => {
            set("autoCreate", v as MemoryConfig["autoCreate"]);
            save();
          }),
      );
    new Setting(containerEl)
      .setName("Minimum confidence")
      .setDesc("0–1. Below this, captures aren't filed automatically.")
      .addText((t) =>
        t.setValue(String(cfg.minConfidence)).onChange((v) => {
          const n = Number(v);
          if (Number.isFinite(n)) set("minConfidence", Math.max(0, Math.min(1, n)));
          save();
        }),
      );
    text("Summary style", "Guidance on summary shape.", "summaryStyle");
    new Setting(containerEl)
      .setName("Explain routing")
      .setDesc("Append a short 'why filed here' line to each entry.")
      .addToggle((t) =>
        t.setValue(cfg.explainRouting).onChange((v) => {
          set("explainRouting", v);
          save();
        }),
      );

    // ---- WHY -----------------------------------------------------------
    containerEl.createEl("h2", { text: "Why — purpose" });
    new Setting(containerEl)
      .setName("Purpose")
      .setDesc("The intent of this second brain (used in the memory loader).")
      .addTextArea((t) =>
        t.setValue(cfg.purpose).onChange((v) => {
          set("purpose", v);
          save();
        }),
      );

    // ---- LLM -----------------------------------------------------------
    containerEl.createEl("h2", { text: "LLM" });
    new Setting(containerEl)
      .setName("Provider")
      .addDropdown((d) =>
        d
          .addOptions({ openai: "OpenAI", anthropic: "Anthropic" })
          .setValue(cfg.llm.provider)
          .onChange((v) => {
            this.plugin.data.config.llm = {
              ...this.plugin.config().llm,
              provider: v as MemoryConfig["llm"]["provider"],
            };
            save();
          }),
      );
    new Setting(containerEl)
      .setName("Model")
      .setDesc("Optional model override.")
      .addText((t) =>
        t.setValue(cfg.llm.model ?? "").onChange((v) => {
          this.plugin.data.config.llm = { ...this.plugin.config().llm, model: v || undefined };
          save();
        }),
      );
    new Setting(containerEl)
      .setName("API key")
      .setDesc("Stored locally in this vault's plugin data.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.data.apiKey).onChange((v) => {
          this.plugin.data.apiKey = v;
          save();
        });
      });
  }
}
