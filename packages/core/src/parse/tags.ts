/**
 * Extract Obsidian tags from a note body, supporting nested tags (`#a/b/c`).
 *
 * A tag starts with `#`, must contain at least one non-numeric character (so we
 * don't capture `#1` style anchors), and is preceded by start-of-string or
 * whitespace (so we don't capture URL fragments or markdown headings).
 */
const TAG_RE = /(^|\s)#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/g;

export function extractBodyTags(markdown: string): string[] {
  const tags = new Set<string>();
  for (const match of markdown.matchAll(TAG_RE)) {
    const tag = match[2];
    if (tag) tags.add(normalizeTag(tag));
  }
  return [...tags];
}

/** Normalize frontmatter `tags:` which may be a string or string[]. */
export function normalizeFrontmatterTags(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean)
      .map(normalizeTag);
  }
  if (Array.isArray(value)) {
    return value
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean)
      .map(normalizeTag);
  }
  return [];
}

/** Canonical tag form used as a graph node id (lowercased). */
export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toLowerCase();
}
