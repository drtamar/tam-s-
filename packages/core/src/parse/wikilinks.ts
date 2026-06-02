/** A parsed Obsidian wikilink: `[[target#heading|alias]]` or embed `![[target]]`. */
export interface WikiLink {
  /** The link target (note name or path), e.g. `Some Note`. */
  target: string;
  /** Optional heading/block reference after `#`. */
  heading?: string;
  /** Optional display alias after `|`. */
  alias?: string;
  /** True when written as an embed (`![[...]]`). */
  embed: boolean;
}

// Matches [[target]], [[target#heading]], [[target|alias]], [[target#heading|alias]]
// and the embed form ![[...]]. Targets may contain spaces, slashes, etc.
const WIKILINK_RE = /(!)?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/**
 * Extract every wikilink and embed from raw markdown.
 *
 * Wikilinks are not standard markdown, so we scan the raw text directly. This
 * gives us full control over Obsidian's `[[a#h|alias]]` and `![[embed]]` forms.
 */
export function extractWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const target = match[2]?.trim();
    if (!target) continue;
    links.push({
      target,
      heading: match[3]?.trim() || undefined,
      alias: match[4]?.trim() || undefined,
      embed: match[1] === "!",
    });
  }
  return links;
}
