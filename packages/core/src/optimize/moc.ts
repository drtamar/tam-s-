import type { GraphModel } from "../graph/GraphModel.js";
import { noteTitle } from "../util/ids.js";

/** A generated Map-of-Content note. */
export interface MocResult {
  title: string;
  markdown: string;
  noteIds: string[];
}

/**
 * Generate a Map-of-Content for a tag: a note that links every note carrying
 * that tag, alphabetized. The returned markdown can be written back to the vault.
 */
export function generateTagMoc(graph: GraphModel, tag: string): MocResult {
  const tagId = `#${tag.replace(/^#/, "").toLowerCase()}`;
  const noteIds = graph
    .incoming(tagId)
    .filter((e) => e.kind === "tagged")
    .map((e) => e.from)
    .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));

  const title = `MOC - ${tag.replace(/^#/, "")}`;
  const lines = [
    `# ${title}`,
    "",
    `Map of content for #${tag.replace(/^#/, "")}.`,
    "",
    ...noteIds.map((id) => `- [[${noteTitle(id)}]]`),
    "",
  ];
  return { title, markdown: lines.join("\n"), noteIds };
}
