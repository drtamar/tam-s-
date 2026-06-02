import { slugify } from "../util/slugify.js";

/** A proposed canonical mapping for tag variants that should be merged. */
export interface TagNormalizeProposal {
  canonical: string;
  variants: string[];
}

/**
 * Group tags that differ only by case or separator style (`ToDo`, `to-do`,
 * `to_do`) and propose a single canonical, slugified form. Tags that already
 * stand alone are not reported.
 */
export function proposeTagNormalization(tags: string[]): TagNormalizeProposal[] {
  const groups = new Map<string, Set<string>>();
  for (const tag of tags) {
    const key = slugify(tag.replace(/[\/_]/g, "-"));
    if (!key) continue;
    const set = groups.get(key) ?? new Set<string>();
    set.add(tag);
    groups.set(key, set);
  }
  const proposals: TagNormalizeProposal[] = [];
  for (const [canonical, set] of groups) {
    if (set.size > 1) {
      proposals.push({ canonical, variants: [...set].sort() });
    }
  }
  return proposals.sort((a, b) => a.canonical.localeCompare(b.canonical));
}
