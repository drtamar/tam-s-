import type { VaultReader } from "../vault/VaultReader.js";
import { parseNote } from "../parse/parseNote.js";
import type { ProjectProfile } from "./types.js";

/**
 * Load project profiles from a folder of project notes (e.g. `Projects/`).
 * The description is taken from the note body (frontmatter stripped), trimmed to
 * a classifier-friendly length.
 */
export async function loadProjects(
  vault: VaultReader,
  folder = "Projects",
  descriptionChars = 600,
): Promise<ProjectProfile[]> {
  const prefix = folder.replace(/\/+$/, "") + "/";
  const paths = (await vault.list()).filter((p) => p.startsWith(prefix));
  const projects: ProjectProfile[] = [];
  for (const path of paths) {
    const note = parseNote(await vault.readFile(path));
    projects.push({
      id: note.id,
      path: note.path,
      title: note.title,
      description: note.body.replace(/\s+/g, " ").trim().slice(0, descriptionChars),
    });
  }
  return projects.sort((a, b) => a.title.localeCompare(b.title));
}
