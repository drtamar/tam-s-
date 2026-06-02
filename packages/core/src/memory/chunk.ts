import type { ParsedNote } from "../parse/parseNote.js";

export interface Chunk {
  noteId: string;
  headingPath: string;
  text: string;
}

export interface ChunkOptions {
  /** Soft maximum characters per chunk (~4 chars/token). Default ~1600 (~400 tokens). */
  maxChars?: number;
  /** Overlap characters carried between consecutive chunks. Default ~200. */
  overlapChars?: number;
}

/**
 * Heading-aware chunking: split a note at ATX heading boundaries, then soft-wrap
 * each section to `maxChars` with a little overlap. Small models (bge-small,
 * MiniLM) degrade on long inputs, so chunks are kept modest.
 */
export function chunkNote(note: ParsedNote, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 1600;
  const overlapChars = options.overlapChars ?? 200;
  const lines = note.body.split(/\r?\n/);

  const sections: { headingPath: string; text: string }[] = [];
  const trail: { level: number; text: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      sections.push({
        headingPath: trail.map((h) => h.text).join(" > "),
        text,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h && h[1] && h[2] !== undefined) {
      flush();
      const level = h[1].length;
      while (trail.length && (trail[trail.length - 1] as { level: number }).level >= level) {
        trail.pop();
      }
      trail.push({ level, text: h[2].trim() });
    } else {
      buffer.push(line);
    }
  }
  flush();

  const chunks: Chunk[] = [];
  for (const section of sections) {
    for (const text of softWrap(section.text, maxChars, overlapChars)) {
      chunks.push({ noteId: note.id, headingPath: section.headingPath, text });
    }
  }
  return chunks;
}

function softWrap(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Prefer to break on a paragraph or sentence boundary.
      const window = text.slice(start, end);
      const br = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (br > maxChars * 0.5) end = start + br + 1;
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return parts.filter(Boolean);
}
