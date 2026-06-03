import type { VaultReader } from "../vault/VaultReader.js";
import type { MemoryConfig } from "../config/MemoryConfig.js";
import { parseNote } from "../parse/parseNote.js";
import { loadCollection } from "../projects/loadProjects.js";
import { renderMemoryContext } from "./render.js";

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
 *
 * (Node/CLI/MCP gatherer; the Obsidian plugin gathers via the metadata cache and
 * calls {@link renderMemoryContext} directly.)
 */
export async function buildMemoryContext(
  vault: VaultReader,
  config: MemoryConfig,
): Promise<string> {
  const [aboutMe, projects, areas] = await Promise.all([
    readBody(vault, config.aboutMeNote),
    loadCollection(vault, config.projectsFolder, "project"),
    loadCollection(vault, config.areasFolder, "area"),
  ]);

  const withBody = async (cs: { path: string; title: string }[]) =>
    Promise.all(cs.map(async (c) => ({ title: c.title, body: await readBody(vault, c.path) })));

  return renderMemoryContext(config, {
    aboutMe,
    projects: await withBody(projects),
    areas: await withBody(areas),
  });
}
