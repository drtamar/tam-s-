import type { App } from "obsidian";
import type { CollectionKind, ProjectProfile } from "@osb/core/projects";

/** Strip a leading YAML frontmatter block without gray-matter (mobile-safe). */
export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function loadCollectionFromCache(
  app: App,
  folder: string,
  kind: CollectionKind,
  descriptionChars = 600,
): Promise<ProjectProfile[]> {
  const prefix = folder.replace(/\/+$/, "") + "/";
  const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
  const out: ProjectProfile[] = [];
  for (const f of files) {
    const body = stripFrontmatter(await app.vault.cachedRead(f))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, descriptionChars);
    out.push({ id: f.path.replace(/\.md$/i, ""), path: f.path, title: f.basename, description: body, kind });
  }
  return out;
}

/** Build project + area profiles from the Obsidian vault (no gray-matter). */
export async function loadCollectionsFromCache(
  app: App,
  projectsFolder: string,
  areasFolder: string,
): Promise<ProjectProfile[]> {
  const [projects, areas] = await Promise.all([
    loadCollectionFromCache(app, projectsFolder, "project"),
    loadCollectionFromCache(app, areasFolder, "area"),
  ]);
  return [...projects, ...areas].sort((a, b) => a.title.localeCompare(b.title));
}
