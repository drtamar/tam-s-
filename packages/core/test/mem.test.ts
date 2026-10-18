import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import {
  ChatIndex,
  FactStore,
  buildPack,
  chatPath,
  mergeFacts,
  parseChat,
  quickSummary,
  renderChat,
  type ChatMeta,
  type Fact,
} from "../src/mem/index.js";

let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});
const mkVault = async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-mem-"));
  return new NodeVaultReader(dir);
};
const f = (id: string, x: string, o: Partial<Fact> = {}): Fact => ({
  id, t: "fact", s: "about", x, ts: "2026-10-01", ...o,
});

describe("mergeFacts", () => {
  it("applies supersede, tombstones and text dedupe", () => {
    const out = mergeFacts([
      f("a", "Likes tea"),
      f("b", "Likes coffee", { ts: "2026-10-02", rep: "a" }),
      f("c", "Temp"),
      f("c", "", { del: 1, ts: "2026-10-03" }),
      f("d", "Hates  repeating!", { ts: "2026-10-04" }),
      f("e", "hates repeating", { ts: "2026-10-05" }),
    ]);
    expect(out.map((x) => x.id).sort()).toEqual(["b", "e"]);
  });
});

describe("FactStore (two devices, one synced folder)", () => {
  it("merges per-device files without conflicts", async () => {
    const vault = await mkVault();
    const phone = new FactStore(vault, "phone");
    const pc = new FactStore(vault, "pc");
    await phone.add({ x: "Prefers short answers", t: "pref" });
    const b = await pc.add({ x: "Main focus is Vetos", s: "Projects/Vetos" });
    expect((await phone.load()).length).toBe(2);
    await phone.remove(b.id);
    expect((await pc.load()).map((x) => x.x)).toEqual(["Prefers short answers"]);
    expect(await vault.exists("memory/phone.jsonl")).toBe(true);
    expect(await vault.exists("memory/pc.jsonl")).toBe(true);
  });
});

describe("buildPack", () => {
  const facts: Fact[] = [
    f("1", "Hates repeating himself", { t: "pref" }),
    f("2", "Visual thinker", { t: "id" }),
    f("3", "Logo is a one-color vector mark", { s: "Projects/Vetos" }),
    f("4", "YouTube channel is faceless", { s: "Projects/YouTube" }),
    f("5", "Pricing test planned for the shop", { s: "Projects/Income" }),
  ];
  it("always includes core facts and groups by scope", () => {
    const p = buildPack(facts, { scope: "Projects/Vetos" });
    expect(p.text).toContain("pref: Hates repeating himself");
    expect(p.text).toContain("[Projects/Vetos]");
    expect(p.text).not.toContain("faceless");
  });
  it("retrieves by query and respects the budget", () => {
    expect(buildPack(facts, { query: "youtube channel" }).text).toContain("faceless");
    const tiny = buildPack(facts, { query: "logo youtube pricing", budgetTokens: 20 });
    expect(tiny.tokens).toBeLessThanOrEqual(24);
  });
});

describe("chats", () => {
  const meta: ChatMeta = {
    id: "k2x9", provider: "gemini", model: "gemini-2.5-pro", agent: "Designer",
    project: "Projects/Vetos", title: "Logo: colors?", summary: "", created: "2026-10-18", updated: "2026-10-18",
  };
  const msgs = [
    { role: "user" as const, content: "What palette suits an alien planet logo?" },
    { role: "assistant" as const, content: "Try deep teal with one neon accent." },
  ];
  it("round-trips through markdown", () => {
    const parsed = parseChat(renderChat({ ...meta, summary: quickSummary(msgs) }, msgs));
    expect(parsed?.meta.title).toBe("Logo: colors?");
    expect(parsed?.meta.provider).toBe("gemini");
    expect(parsed?.messages).toEqual(msgs);
  });
  it("finds the right chat by who, what, and when", async () => {
    const vault = await mkVault();
    const other: ChatMeta = { ...meta, id: "z1", provider: "grok", agent: "Coach", project: "Areas/Health", title: "Sleep plan", created: "2026-09-02" };
    await vault.write(chatPath(meta), renderChat(meta, msgs));
    await vault.write(chatPath(other), renderChat(other, [{ role: "user", content: "Help me fix my sleep schedule" }]));
    const idx = new ChatIndex(vault);
    expect(await idx.refresh()).toBe(2);
    expect(idx.search({ query: "sleep" })[0]?.meta.provider).toBe("grok");
    expect(idx.search({ query: "palette" })[0]?.snippet).toContain("palette");
    expect(idx.search({ provider: "gemini" }).map((h) => h.meta.id)).toEqual(["k2x9"]);
    expect(idx.search({ from: "2026-10-01" }).length).toBe(1);
  });
});
