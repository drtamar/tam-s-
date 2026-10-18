import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import {
  ChatIndex,
  ChatSession,
  FactStore,
  createProvider,
  type ChatProvider,
  type Http,
} from "../src/mem/index.js";

let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

async function setup() {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-sess-"));
  const vault = new NodeVaultReader(dir);
  const facts = new FactStore(vault, "pc");
  await facts.add({ t: "pref", x: "Hates repeating himself" });
  await facts.add({ s: "Projects/Vetos", x: "Logo is a one-color vector mark" });
  return { vault, facts };
}

describe("ChatSession", () => {
  it("injects memory, saves a searchable note, and resumes", async () => {
    const { vault, facts } = await setup();
    const seen: string[] = [];
    const provider: ChatProvider = {
      id: "gemini",
      async chat(_m, o) {
        seen.push(o.system ?? "");
        return "Try deep teal.";
      },
    };
    const deps = {
      vault, facts, provider, model: "m",
      agent: { name: "Designer", prompt: "You are a designer.", project: "Projects/Vetos" },
    };
    const s = new ChatSession(deps);
    const r = await s.send("What palette for the logo?");

    expect(seen[0]).toContain("You are a designer.");
    expect(seen[0]).toContain("Hates repeating himself");
    expect(seen[0]).toContain("one-color vector mark");
    expect(r.memoryIds.length).toBe(2);

    const idx = new ChatIndex(vault);
    await idx.refresh();
    const hit = idx.search({ query: "palette" })[0];
    expect(hit?.meta.provider).toBe("gemini");
    expect(hit?.meta.agent).toBe("Designer");

    // Continue the same chat later, on a different provider.
    const resumed = await ChatSession.open(s.path, { ...deps, provider: { ...provider, id: "claude" } });
    expect(resumed?.messages.length).toBe(2);
    await resumed!.send("And the font?");
    expect(resumed!.messages.length).toBe(4);
  });

  it("rolls back the user message when the provider fails", async () => {
    const { vault, facts } = await setup();
    const provider: ChatProvider = { id: "grok", chat: async () => { throw new Error("boom"); } };
    const s = new ChatSession({ vault, facts, provider, model: "m", agent: { name: "A", prompt: "p" } });
    await expect(s.send("hi")).rejects.toThrow("boom");
    expect(s.messages).toEqual([]);
  });
});

describe("providers", () => {
  it("builds Claude vs OpenAI-compatible requests correctly", async () => {
    const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
    const http: Http = async (req) => {
      calls.push({ url: req.url, headers: req.headers, body: JSON.parse(req.body) });
      return {
        status: 200,
        text: JSON.stringify(
          req.url.includes("anthropic")
            ? { content: [{ type: "text", text: "claude-reply" }] }
            : { choices: [{ message: { content: "compat-reply" } }] },
        ),
      };
    };
    const msgs = [{ role: "user" as const, content: "hi" }];

    expect(await createProvider("claude", "k", http).chat(msgs, { model: "m", system: "S" })).toBe("claude-reply");
    expect(calls[0]!.headers["x-api-key"]).toBe("k");
    expect(calls[0]!.body.system).toBe("S");

    expect(await createProvider("grok", "k2", http).chat(msgs, { model: "m", system: "S" })).toBe("compat-reply");
    expect(calls[1]!.url).toContain("x.ai");
    expect(calls[1]!.body.messages[0]).toEqual({ role: "system", content: "S" });

    await createProvider("gemini", "k3", http).chat(msgs, { model: "m" });
    expect(calls[2]!.url).toContain("generativelanguage.googleapis.com");
  });

  it("surfaces API errors readably and requires a key", async () => {
    const http: Http = async () => ({ status: 401, text: JSON.stringify({ error: { message: "bad key" } }) });
    await expect(createProvider("openai", "k", http).chat([], { model: "m" })).rejects.toThrow("OpenAI 401: bad key");
    expect(() => createProvider("claude", "", http)).toThrow("No API key set for Claude");
  });
});
