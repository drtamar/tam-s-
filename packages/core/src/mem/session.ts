import type { VaultReader } from "../vault/VaultReader.js";
import { chatPath, newChatId, parseChat, quickSummary, renderChat } from "./chat.js";
import { FactStore } from "./facts.js";
import { buildPack } from "./pack.js";
import type { ChatProvider } from "./providers.js";
import type { ChatMessage, ChatMeta } from "./types.js";

/** An agent is just a profile: a name, a prompt, and an optional memory scope. */
export interface AgentProfile {
  name: string;
  prompt: string;
  /** Project/area id whose facts are always pulled into this agent's chats. */
  project?: string;
}

export interface SessionDeps {
  vault: VaultReader;
  facts: FactStore;
  provider: ChatProvider;
  model: string;
  agent: AgentProfile;
  /** Max tokens of memory injected per turn. */
  packBudget?: number;
  /** Only the last N messages are sent, to bound cost on long chats. */
  historyLimit?: number;
}

export interface Reply {
  text: string;
  /** Which facts the model was shown — for transparency in the UI. */
  memoryIds: string[];
  memoryTokens: number;
}

/**
 * One conversation: injects the memory pack, calls the provider, and saves the
 * whole chat as a searchable note after every turn. Resumable from its note.
 */
export class ChatSession {
  meta: ChatMeta;
  messages: ChatMessage[];
  path: string;

  constructor(
    private readonly deps: SessionDeps,
    state?: { meta: ChatMeta; messages: ChatMessage[]; path: string },
    now = new Date(),
  ) {
    const day = now.toISOString().slice(0, 10);
    this.meta = state?.meta ?? {
      id: newChatId(now),
      provider: deps.provider.id,
      model: deps.model,
      agent: deps.agent.name,
      project: deps.agent.project ?? "",
      title: "New chat",
      summary: "",
      created: day,
      updated: day,
    };
    this.messages = state?.messages ?? [];
    this.path = state?.path ?? chatPath(this.meta);
  }

  /** Reopen a saved chat note, continuing with the given deps (e.g. a new provider). */
  static async open(path: string, deps: SessionDeps): Promise<ChatSession | null> {
    const parsed = parseChat(await deps.vault.read(path));
    return parsed ? new ChatSession(deps, { ...parsed, path }) : null;
  }

  async send(text: string, now = new Date()): Promise<Reply> {
    const { deps } = this;
    this.messages.push({ role: "user", content: text });
    try {
      const facts = await deps.facts.load();
      const pack = buildPack(facts, {
        query: text,
        scope: deps.agent.project,
        budgetTokens: deps.packBudget,
      });
      const system = `${deps.agent.prompt.trim()}\n\n${pack.text}`;
      const history = this.messages.slice(-(deps.historyLimit ?? 20));
      const reply = await deps.provider.chat(history, { system, model: deps.model });

      this.messages.push({ role: "assistant", content: reply });
      if (this.meta.title === "New chat") this.meta.title = text.replace(/\s+/g, " ").slice(0, 50);
      this.meta.summary = quickSummary(this.messages);
      this.meta.updated = now.toISOString().slice(0, 10);
      await deps.vault.write(this.path, renderChat(this.meta, this.messages));
      return { text: reply, memoryIds: pack.ids, memoryTokens: pack.tokens };
    } catch (err) {
      this.messages.pop(); // don't keep an unanswered message — retry stays clean
      throw err;
    }
  }
}
