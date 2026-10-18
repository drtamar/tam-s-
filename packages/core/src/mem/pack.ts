import { bm25, estimateTokens } from "./bm25.js";
import type { Fact } from "./types.js";

export interface PackOptions {
  /** The user's current message — used to retrieve relevant facts. */
  query?: string;
  /** Project/area id the chat is about; its facts are boosted. */
  scope?: string;
  /** Hard cap on the pack, in estimated tokens. Default 600. */
  budgetTokens?: number;
}

export interface Pack {
  /** Compact text, ready to put in a system prompt. */
  text: string;
  /** Ids of facts included (for "what did the model see?" transparency). */
  ids: string[];
  tokens: number;
}

const ALWAYS_ON = new Set(["id", "pref", "rule"]);

/**
 * Build the memory pack for one chat turn, in three tiers:
 *  1. always-on: who you are + standing preferences/rules (about 40% of budget),
 *  2. scoped: facts for the active project/area,
 *  3. retrieved: BM25 matches for the current message.
 * Plain `[scope]` + `- line` text beats JSON for tokens (no quotes or braces);
 * the stable header lets provider prompt-caching reuse the prefix.
 */
export function buildPack(facts: Fact[], opts: PackOptions = {}): Pack {
  const budget = opts.budgetTokens ?? 600;
  const chosen: Fact[] = [];
  const seen = new Set<string>();
  const scopes = new Set<string>();
  let used = estimateTokens("# MEM\n");

  const take = (f: Fact, cap: number): boolean => {
    if (seen.has(f.id)) return true;
    const header = scopes.has(f.s) ? 0 : estimateTokens(`[${f.s}]\n`);
    const cost = header + estimateTokens(`- ${f.t === "fact" ? "" : f.t + ": "}${f.x}\n`);
    if (used + cost > cap) return false;
    used += cost;
    scopes.add(f.s);
    seen.add(f.id);
    chosen.push(f);
    return true;
  };

  // Tier 1 — always-on, newest first within its share.
  const core = facts
    .filter((f) => ALWAYS_ON.has(f.t) || f.s === "about")
    .sort((a, b) => b.ts.localeCompare(a.ts));
  const coreCap = Math.floor(budget * 0.4);
  for (const f of core) if (!take(f, coreCap)) break;

  // Tier 2 — active scope.
  if (opts.scope) {
    const scoped = facts
      .filter((f) => f.s === opts.scope)
      .sort((a, b) => b.ts.localeCompare(a.ts));
    const cap = Math.floor(budget * 0.75);
    for (const f of scoped) if (!take(f, cap)) break;
  }

  // Tier 3 — retrieved by query, scope-boosted.
  if (opts.query) {
    const ranked = bm25(facts, (f) => `${f.x} ${f.s}`, opts.query);
    for (const { item } of ranked) if (!take(item, budget)) break;
  }

  // Render grouped by scope.
  const groups = new Map<string, Fact[]>();
  for (const f of chosen) {
    const g = groups.get(f.s) ?? [];
    g.push(f);
    groups.set(f.s, g);
  }
  let text = "# MEM\n";
  for (const [scope, list] of groups) {
    text += `[${scope}]\n`;
    for (const f of list) text += `- ${f.t === "fact" ? "" : f.t + ": "}${f.x}\n`;
  }
  return { text, ids: chosen.map((f) => f.id), tokens: estimateTokens(text) };
}
