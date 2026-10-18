import { ItemView, MarkdownRenderer, Modal, Notice, Setting, setIcon, type WorkspaceLeaf } from "obsidian";
import {
  ChatIndex,
  ChatSession,
  PROVIDER_LABELS,
  type ChatHit,
  type FactType,
  type Provider,
} from "@osb/core/mem";
import type SecondBrainPlugin from "./main.js";
import { PROVIDERS } from "./settings.js";

export const VIEW_TYPE = "second-brain-view";
type Tab = "chat" | "history";

export class SecondBrainView extends ItemView {
  #tab: Tab = "chat";
  #session: ChatSession | null = null;
  #busy = false;
  #chip = "";
  #index: ChatIndex;
  #hits: ChatHit[] = [];
  #query = "";
  #provFilter: Provider | "" = "";
  #days = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SecondBrainPlugin) {
    super(leaf);
    this.#index = new ChatIndex(plugin.reader);
  }

  override getViewType(): string { return VIEW_TYPE; }
  override getDisplayText(): string { return "Second Brain"; }
  override getIcon(): string { return "brain"; }

  override async onOpen(): Promise<void> { this.#render(); }
  override async onClose(): Promise<void> { this.contentEl.empty(); }

  show(tab: Tab): void {
    this.#tab = tab;
    this.#render();
  }

  /** Start a fresh chat with the currently selected provider + agent. */
  newChat(): void {
    this.#session = null;
    this.#chip = "";
    this.#tab = "chat";
    this.#render();
  }

  /** Reopen a saved chat on its original provider and agent. */
  async resume(path: string): Promise<void> {
    try {
      const text = await this.plugin.reader.read(path);
      const provider = (text.match(/^provider: (\w+)$/m)?.[1] ?? "claude") as Provider;
      const agent = text.match(/^agent: (.*)$/m)?.[1]?.replace(/^"|"$/g, "") ?? "";
      const session = await ChatSession.open(path, this.plugin.deps(provider, agent));
      if (!session) return void new Notice("That note isn't a chat.");
      this.#session = session;
      this.plugin.data.provider = provider;
      this.#tab = "chat";
      this.#chip = "";
      this.#render();
    } catch (e) {
      new Notice((e as Error).message);
    }
  }

  #render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("osb-root");

    const tabs = el.createDiv({ cls: "osb-tabs" });
    for (const [id, label] of [["chat", "Chat"], ["history", "History"]] as const) {
      const b = tabs.createEl("button", { text: label, cls: "osb-tab" + (this.#tab === id ? " is-active" : "") });
      b.onclick = () => this.show(id);
    }
    if (this.#tab === "chat") this.#renderChat(el);
    else void this.#renderHistory(el);
  }

  // ---------------------------------------------------------------- chat
  #renderChat(root: HTMLElement): void {
    const d = this.plugin.data;
    const bar = root.createDiv({ cls: "osb-toolbar" });

    const prov = bar.createEl("select");
    for (const p of PROVIDERS) prov.createEl("option", { text: PROVIDER_LABELS[p], value: p });
    prov.value = this.#session ? (this.#session.meta.provider as string) : d.provider;
    prov.onchange = () => {
      d.provider = prov.value as Provider;
      void this.plugin.persist();
      this.#switched(`Started a new chat with ${PROVIDER_LABELS[d.provider]}`);
    };

    const agent = bar.createEl("select");
    for (const a of d.agents) agent.createEl("option", { text: a.name, value: a.name });
    agent.value = this.#session ? this.#session.meta.agent : d.agent;
    agent.onchange = () => {
      d.agent = agent.value;
      void this.plugin.persist();
      this.#switched(`Started a new chat with ${d.agent}`);
    };

    const nb = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "New chat" } });
    setIcon(nb, "plus");
    nb.onclick = () => this.newChat();

    const label = this.#session
      ? `${PROVIDER_LABELS[this.#session.meta.provider]} · ${this.#session.meta.agent}`
      : `${PROVIDER_LABELS[d.provider]} · ${d.agent}`;
    root.createDiv({ cls: "osb-who", text: label + (this.#chip ? `   ${this.#chip}` : "") });

    const msgs = root.createDiv({ cls: "osb-msgs" });
    this.#renderMessages(msgs);

    const composer = root.createDiv({ cls: "osb-composer" });
    const input = composer.createEl("textarea", { attr: { rows: "3", placeholder: "Message… (memory is added automatically)" } });
    const send = composer.createEl("button", { text: "Send", cls: "mod-cta" });
    const go = () => void this.#send(input, send, msgs);
    send.onclick = go;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); }
    });
  }

  #switched(note: string): void {
    if (this.#session && this.#session.messages.length) new Notice(note);
    this.#session = null;
    this.#chip = "";
    this.#render();
  }

  #renderMessages(box: HTMLElement): void {
    box.empty();
    const s = this.#session;
    if (!s || s.messages.length === 0) {
      box.createDiv({ cls: "osb-empty", text: "Ask anything. Your shared memory is included automatically, and every chat is saved and searchable." });
      return;
    }
    for (const m of s.messages) {
      const bubble = box.createDiv({ cls: `osb-msg osb-${m.role}` });
      const body = bubble.createDiv({ cls: "osb-body" });
      if (m.role === "assistant") {
        void MarkdownRenderer.render(this.app, m.content, body, "", this);
        const row = bubble.createDiv({ cls: "osb-actions" });
        const rb = row.createEl("button", { text: "Remember", cls: "osb-link" });
        rb.onclick = () => new RememberModal(this.plugin, m.content, s.meta.project || "about", s.path).open();
        const cb = row.createEl("button", { text: "Copy", cls: "osb-link" });
        cb.onclick = () => void navigator.clipboard.writeText(m.content).then(() => new Notice("Copied"));
      } else {
        body.setText(m.content);
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  async #send(input: HTMLTextAreaElement, btn: HTMLButtonElement, box: HTMLElement): Promise<void> {
    const text = input.value.trim();
    if (!text || this.#busy) return;
    try {
      this.#session ??= this.plugin.newSession();
    } catch (e) {
      return void new Notice((e as Error).message);
    }
    const session = this.#session;
    this.#busy = true;
    btn.disabled = true;
    input.value = "";

    box.querySelector(".osb-empty")?.remove();
    box.createDiv({ cls: "osb-msg osb-user" }).createDiv({ cls: "osb-body", text });
    const pending = box.createDiv({ cls: "osb-msg osb-assistant osb-pending" });
    pending.createDiv({ cls: "osb-body", text: "Thinking…" });
    box.scrollTop = box.scrollHeight;

    try {
      const r = await session.send(text);
      this.#chip = `🧠 ${r.memoryIds.length} facts · ~${r.memoryTokens} tokens`;
      this.#renderMessages(box);
      this.contentEl.querySelector(".osb-who")?.setText(`${PROVIDER_LABELS[session.meta.provider]} · ${session.meta.agent}   ${this.#chip}`);
    } catch (e) {
      pending.remove();
      input.value = text;
      new Notice((e as Error).message, 8000);
    } finally {
      this.#busy = false;
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------- history
  async #renderHistory(root: HTMLElement): Promise<void> {
    const bar = root.createDiv({ cls: "osb-toolbar osb-search" });
    const q = bar.createEl("input", { type: "search", attr: { placeholder: "Search all chats…" } });
    q.value = this.#query;
    const prov = bar.createEl("select");
    prov.createEl("option", { text: "All AIs", value: "" });
    for (const p of PROVIDERS) prov.createEl("option", { text: PROVIDER_LABELS[p], value: p });
    prov.value = this.#provFilter;
    const when = bar.createEl("select");
    for (const [v, l] of [[0, "Any time"], [7, "7 days"], [30, "30 days"], [365, "1 year"]] as const) when.createEl("option", { text: l, value: String(v) });
    when.value = String(this.#days);

    const list = root.createDiv({ cls: "osb-hits" });
    const count = await this.#index.refresh();
    const run = () => {
      this.#query = q.value;
      this.#provFilter = prov.value as Provider | "";
      this.#days = Number(when.value);
      const from = this.#days ? new Date(Date.now() - this.#days * 864e5).toISOString().slice(0, 10) : undefined;
      this.#hits = this.#index.search({ query: q.value, provider: this.#provFilter || undefined, from, limit: 30 });
      this.#renderHits(list, count);
    };
    let t: number | undefined;
    q.oninput = () => { window.clearTimeout(t); t = window.setTimeout(run, 200); };
    prov.onchange = run;
    when.onchange = run;
    run();
  }

  #renderHits(list: HTMLElement, total: number): void {
    list.empty();
    if (this.#hits.length === 0) {
      list.createDiv({ cls: "osb-empty", text: total === 0 ? "No chats saved yet. Start one in the Chat tab." : "No chats match." });
      return;
    }
    for (const h of this.#hits) {
      const item = list.createDiv({ cls: "osb-hit" });
      const top = item.createDiv({ cls: "osb-hit-top" });
      top.createSpan({ cls: `osb-badge osb-${h.meta.provider}`, text: PROVIDER_LABELS[h.meta.provider] });
      top.createSpan({ cls: "osb-meta", text: `${h.meta.agent} · ${h.meta.created}${h.meta.project ? " · " + h.meta.project.split("/").pop() : ""}` });
      item.createDiv({ cls: "osb-hit-title", text: h.meta.title });
      if (h.snippet) item.createDiv({ cls: "osb-snippet", text: h.snippet });
      const row = item.createDiv({ cls: "osb-actions" });
      row.createEl("button", { text: "Continue", cls: "osb-link" }).onclick = () => void this.resume(h.path);
      row.createEl("button", { text: "Open note", cls: "osb-link" }).onclick = () => void this.app.workspace.openLinkText(h.path, "", false);
    }
  }
}

/** Confirm-and-save dialog: nothing enters shared memory without a tap. */
class RememberModal extends Modal {
  constructor(
    private readonly plugin: SecondBrainPlugin,
    private readonly text: string,
    private readonly defaultScope: string,
    private readonly chatPath: string,
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Save to shared memory" });
    contentEl.createEl("p", { text: "Edit it down to one short fact. Every AI you use will see it.", cls: "setting-item-description" });

    let fact = this.text.replace(/\s+/g, " ").trim().slice(0, 240);
    let type: FactType = "fact";
    let scope = this.defaultScope && this.defaultScope !== "about" ? this.defaultScope : "about";

    new Setting(contentEl).addTextArea((t) => {
      t.setValue(fact).onChange((v) => (fact = v));
      t.inputEl.rows = 4;
      t.inputEl.style.width = "100%";
    });
    new Setting(contentEl).setName("Type").addDropdown((d) =>
      d.addOptions({ fact: "Fact", pref: "Preference", rule: "Rule", goal: "Goal", dec: "Decision", id: "About me" }).setValue(type).onChange((v) => (type = v as FactType)),
    );
    new Setting(contentEl).setName("Scope").setDesc("'about' = always on. Or a project like Projects/Vetos.").addText((t) => t.setValue(scope).onChange((v) => (scope = v.trim() || "about")));
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Save").setCta().onClick(async () => {
        if (!fact.trim()) return;
        await this.plugin.facts().add({ t: type, s: scope, x: fact, src: this.chatPath.replace(/\.md$/, "") });
        new Notice("Saved to memory");
        this.close();
      }))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  override onClose(): void { this.contentEl.empty(); }
}
