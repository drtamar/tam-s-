import type { MemoryConfig } from "../config/MemoryConfig.js";

/** Raw material for the memory loader, gathered per surface (Node or Obsidian). */
export interface MemorySnapshot {
  /** About Me note body (frontmatter already stripped). */
  aboutMe: string;
  /** Projects as { title, body } — body's first line is used as the one-liner. */
  projects: { title: string; body: string }[];
  /** Areas as { title, body }. */
  areas: { title: string; body: string }[];
}

/** First descriptive line of a block of text — skips H1/H2 headings. */
function firstLine(text: string, max = 160): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !/^#{1,3}\s/.test(l)) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Render a portable, LLM-agnostic "memory loader" from a snapshot. Pure string
 * formatting — shared by the Node gatherer (`buildMemoryContext`) and the
 * Obsidian plugin (which gathers via the metadata cache). Bounded by the
 * config's token budget.
 */
export function renderMemoryContext(config: MemoryConfig, snap: MemorySnapshot): string {
  const budgetChars = Math.max(400, config.contextTokenBudget * 4);
  const date = new Date().toISOString().slice(0, 10);

  const aboutMe = snap.aboutMe.trim()
    ? snap.aboutMe.trim().slice(0, Math.floor(budgetChars * 0.4))
    : "(none yet)";

  const line = (c: { title: string; body: string }) =>
    `- **${c.title}** — ${firstLine(c.body) || "(no notes yet)"}`;
  const projectLines = [...snap.projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(line);
  const areaLines = [...snap.areas].sort((a, b) => a.title.localeCompare(b.title)).map(line);

  const sections = [
    `# ${config.memoryLoaderNote.replace(/\.md$/i, "")}`,
    `> Auto-generated ${date}. Portable context — load into any LLM. **READ THIS FIRST.**`,
    `## Purpose\n${config.purpose}`,
    `## About Me\n${aboutMe}`,
    `## Active Projects\n${projectLines.join("\n") || "_none_"}`,
    `## Areas of Life\n${areaLines.join("\n") || "_none_"}`,
    `## Index\n${snap.projects.length} project(s), ${snap.areas.length} area(s).`,
  ];

  let out = sections.join("\n\n").trimEnd() + "\n";
  if (out.length > budgetChars) out = out.slice(0, budgetChars).trimEnd() + "\n…\n";
  return out;
}
