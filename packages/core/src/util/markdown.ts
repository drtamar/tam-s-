/** Insert text under a specific ATX heading, creating the section if absent. */
export function appendUnderHeading(
  content: string,
  heading: string,
  entry: string,
): string {
  const headingLine = heading.trim();
  const lines = content.split(/\r?\n/);
  const level = (headingLine.match(/^#+/)?.[0] ?? "##").length;
  const headingText = headingLine.replace(/^#+\s*/, "").trim().toLowerCase();

  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(/^(#{1,6})\s+(.*)$/);
    if (m && m[2]?.trim().toLowerCase() === headingText) {
      headingIdx = i;
      break;
    }
  }

  const block = entry.trim();

  if (headingIdx === -1) {
    // Section doesn't exist — add it at the end.
    const trimmed = content.replace(/\s*$/, "");
    return `${trimmed}\n\n${headingLine}\n\n${block}\n`;
  }

  // Find the end of this section: the next heading of equal/higher level.
  let insertAt = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = (lines[i] ?? "").match(/^(#{1,6})\s+/);
    if (m && m[1] && m[1].length <= level) {
      insertAt = i;
      break;
    }
  }

  // Trim trailing blank lines within the section, then insert the entry.
  let end = insertAt;
  while (end > headingIdx + 1 && (lines[end - 1] ?? "").trim() === "") end--;
  const before = lines.slice(0, end);
  const after = lines.slice(insertAt);
  return [...before, "", block, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}
