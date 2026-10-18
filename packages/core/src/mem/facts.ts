import type { VaultReader } from "../vault/VaultReader.js";
import type { Fact, FactType } from "./types.js";

export const MEMORY_DIR = "memory";

/** Parse JSONL leniently: bad lines are skipped, never fatal. */
export function parseJsonl(text: string): Fact[] {
  const out: Fact[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const f = JSON.parse(s) as Fact;
      if (f && typeof f.id === "string" && typeof f.x === "string") out.push(f);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

export function toJsonl(facts: Fact[]): string {
  return facts.map((f) => JSON.stringify(f)).join("\n") + (facts.length ? "\n" : "");
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Merge facts from every device file into the current truth. Order is by day
 * (`ts`) then id, so merging is deterministic whatever order files arrive in.
 * Tombstones and `rep` supersession remove old facts; identical text in the
 * same scope collapses to the newest.
 */
export function mergeFacts(all: Fact[]): Fact[] {
  const sorted = [...all].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
  const live = new Map<string, Fact>();
  const byText = new Map<string, string>();

  for (const f of sorted) {
    if (f.del) {
      const old = live.get(f.id);
      if (old) byText.delete(`${old.s}|${norm(old.x)}`);
      live.delete(f.id);
      continue;
    }
    if (f.rep) {
      const old = live.get(f.rep);
      if (old) byText.delete(`${old.s}|${norm(old.x)}`);
      live.delete(f.rep);
    }
    const key = `${f.s}|${norm(f.x)}`;
    const dupe = byText.get(key);
    if (dupe) live.delete(dupe);
    byText.set(key, f.id);
    live.set(f.id, f);
  }
  return [...live.values()];
}

export interface NewFact {
  t?: FactType;
  s?: string;
  x: string;
  src?: string;
  rep?: string;
}

/**
 * Facts live in `memory/<device>.jsonl`. Each device only ever writes its own
 * file, so Google Drive sync between phone and PC can never produce a conflict;
 * reads merge every file.
 */
export class FactStore {
  constructor(
    private readonly vault: VaultReader,
    private readonly device: string,
  ) {}

  #own(): string {
    return `${MEMORY_DIR}/${this.device}.jsonl`;
  }

  /** All current facts across every device. */
  async load(): Promise<Fact[]> {
    const files = (await this.vault.listDir(MEMORY_DIR)).filter((p) => p.endsWith(".jsonl"));
    const all: Fact[] = [];
    for (const p of files) all.push(...parseJsonl(await this.vault.read(p)));
    return mergeFacts(all);
  }

  async add(input: NewFact, now = new Date()): Promise<Fact> {
    const fact: Fact = {
      id: `${this.device}-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
      t: input.t ?? "fact",
      s: input.s ?? "about",
      x: input.x.trim(),
      ts: now.toISOString().slice(0, 10),
      ...(input.src ? { src: input.src } : {}),
      ...(input.rep ? { rep: input.rep } : {}),
    };
    await this.#append(fact);
    return fact;
  }

  async remove(id: string, now = new Date()): Promise<void> {
    await this.#append({
      id,
      t: "fact",
      s: "",
      x: "",
      ts: now.toISOString().slice(0, 10),
      del: 1,
    });
  }

  async #append(fact: Fact): Promise<void> {
    const path = this.#own();
    const existing = (await this.vault.exists(path)) ? await this.vault.read(path) : "";
    await this.vault.write(path, existing + JSON.stringify(fact) + "\n");
  }
}
