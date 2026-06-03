import type { VaultReader } from "../vault/VaultReader.js";
import type { MemoryConfig } from "../config/MemoryConfig.js";
import { parseNote } from "../parse/parseNote.js";
import { loadCollection } from "../projects/loadProjects.js";

/** First non-empty, trimmed line of a block of text. */
function firstLine(text: string, max = 160): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

async function readBody(vault: VaultReader, path: string): Promise<string> {
  try {
    return parseNote(await vault.readFile(path)).body.trim();
  } catch {
    return "";
  }
}

/**
 * Build a portable, LLM-agnostic "memory loader" — a compact digest of who the
 * user is and what they're working on, that can be pasted into any LLM
 * (ChatGPT, Gemini, …) to prime it. Mirrors the user's hand-made "Master Memory
 * Loader" but is regenerated from the live vault and bounded by a token budget.
 */
export async function buildMemoryContext(
  vault: VaultReader,
  config: MemoryConfig,
): Promise<string> {
  const budgetChars = Math.max(400, config.contextTokenBudget * 4);
  const date = new Date().toISOString().slice(0, 10);

  const aboutMeRaw = await readBody(vault, config.aboutMeNote);
  const aboutMe = aboutMeRaw ? aboutMeRaw.slice(0, Math.floor(budgetChars * 0.4)) : "(none yet)";

  const [projects, areas] = await Promise.all([
    loadCollection(vault, config.projectsFolder, "project"),
    loadCollection(vault, config.areasFolder, "area"),
  ]);

  const line = async (path: string, title: string) =>
    `- **${title}** — ${firstLine(await readBody(vault, path)) || "(no notes yet)"}`;

  const projectLines = await Promise.all(
    projects.sort((a, b) => a.title.localeCompare(b.title)).map((p) => line(p.path, p.title)),
  );
  const areaLines = await Promise.all(
    areas.sort((a, b) => a.title.localeCompare(b.title)).map((a) => line(a.path, a.title)),
  );

  const sections = [
    `# ${config.memoryLoaderNote.replace(/\.md$/i, "")}`,
    `> Auto-generated ${date}. Portable context — load into any LLM. **READ THIS FIRST.**`,
    `## Purpose\n${config.purpose}`,
    `## About Me\n${aboutMe}`,
    `## Active Projects\n${projectLines.join("\n") || "_none_"}`,
    `## Areas of Life\n${areaLines.join("\n") || "_none_"}`,
    `## Index\n${projects.length} project(s), ${areas.length} area(s).`,
  ];

  let out = sections.join("\n\n").trimEnd() + "\n";
  if (out.length > budgetChars) out = out.slice(0, budgetChars).trimEnd() + "\n…\n";
  return out;
}
