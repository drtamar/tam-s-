import type { NoteId, NotePath } from "../vault/types.js";
import { noteTitle, pathToId } from "../util/ids.js";

/**
 * Resolves wikilink targets to note ids the way Obsidian does: a bare name
 * `[[Note]]` matches a note by basename; an explicit path `[[folder/Note]]`
 * matches by path. Matching is case-insensitive.
 */
export class LinkResolver {
  /** lowercased basename -> note ids */
  readonly #byName = new Map<string, NoteId[]>();
  /** lowercased id (path w/o ext) -> note id */
  readonly #byPath = new Map<string, NoteId>();

  constructor(paths: NotePath[]) {
    for (const p of paths) {
      const id = pathToId(p);
      this.#byPath.set(id.toLowerCase(), id);
      const name = noteTitle(p).toLowerCase();
      const list = this.#byName.get(name);
      if (list) list.push(id);
      else this.#byName.set(name, [id]);
    }
  }

  /** Returns the resolved note id, or `null` if the link is broken. */
  resolve(target: string): NoteId | null {
    const cleaned = target.trim().replace(/\.md$/i, "");
    const byPath = this.#byPath.get(cleaned.toLowerCase());
    if (byPath) return byPath;
    const byName = this.#byName.get(cleaned.toLowerCase());
    if (byName && byName.length > 0) return byName[0] as NoteId;
    return null;
  }
}
