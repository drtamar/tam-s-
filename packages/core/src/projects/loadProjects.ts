import type { VaultReader } from "../vault/VaultReader.js";
import { parseNote } from "../parse/parseNote.js";
import type { CollectionKind, ProjectProfile } from "./types.js";

/** Load profiles for the notes directly under a folder, tagged with `kind`. */
export async function loadCollection(
  vault: VaultReader,
  folder: string,
  kind: CollectionKind,
  descriptionChars = 600,
): Promise<ProjectProfile[]> {
  const prefix = folder.replace(/\/+$/, "") + "/";
  const paths = (await vault.list()).filter((p) => p.startsWith(prefix));
  const profiles: ProjectProfile[] = [];
  for (const path of paths) {
    const note = parseNote(await vault.readFile(path));
    profiles.push({
      id: note.id,
      path: note.path,
      title: note.title,
      description: note.body.replace(/\s+/g, " ").trim().slice(0, descriptionChars),
      kind,
    });
  }
  return profiles;
}

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
  const projects = await loadCollection(vault, folder, "project", descriptionChars);
  return projects.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Load both projects and areas as a single, sorted list of collections the
 * router can file dumps into.
 */
export async function loadCollections(
  vault: VaultReader,
  projectsFolder = "Projects",
  areasFolder = "Areas",
  descriptionChars = 600,
): Promise<ProjectProfile[]> {
  const [projects, areas] = await Promise.all([
    loadCollection(vault, projectsFolder, "project", descriptionChars),
    loadCollection(vault, areasFolder, "area", descriptionChars),
  ]);
  return [...projects, ...areas].sort((a, b) => a.title.localeCompare(b.title));
}
