import type { NoteId, NotePath } from "../vault/types.js";

/** Convert a vault path to a stable note id (drop the `.md` extension). */
export function pathToId(notePath: NotePath): NoteId {
  return notePath.replace(/\.md$/i, "");
}

/** Convert a note id back to its canonical vault path. */
export function idToPath(id: NoteId): NotePath {
  return id.endsWith(".md") ? id : `${id}.md`;
}

/** The display title of a note: its basename without folders or extension. */
export function noteTitle(notePath: NotePath): string {
  const base = notePath.split("/").pop() ?? notePath;
  return base.replace(/\.md$/i, "");
}
