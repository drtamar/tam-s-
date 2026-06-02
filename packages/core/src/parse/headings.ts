/** A markdown ATX heading. */
export interface Heading {
  level: number;
  text: string;
  /** 0-based line index where the heading appears. */
  line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Extract ATX headings (`# .. ######`), skipping fenced code blocks. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  lines.forEach((raw, line) => {
    const fence = raw.match(/^\s*(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = raw.match(HEADING_RE);
    if (m && m[1] && m[2] !== undefined) {
      headings.push({ level: m[1].length, text: m[2].trim(), line });
    }
  });
  return headings;
}
