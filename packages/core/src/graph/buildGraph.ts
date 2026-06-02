import type { ParsedNote } from "../parse/parseNote.js";
import { GraphModel } from "./GraphModel.js";
import { LinkResolver } from "./resolveLink.js";

/** A wikilink whose target did not resolve to an existing note. */
export interface BrokenLink {
  from: string;
  target: string;
}

export interface BuildGraphResult {
  graph: GraphModel;
  resolver: LinkResolver;
  brokenLinks: BrokenLink[];
}

/**
 * Build the knowledge graph from parsed notes: one node per note, one node per
 * distinct tag, `link`/`embed` edges between notes, and `tagged` edges from
 * notes to tags. Unresolved wikilinks are collected as broken links.
 */
export function buildGraph(notes: ParsedNote[]): BuildGraphResult {
  const graph = new GraphModel();
  const resolver = new LinkResolver(notes.map((n) => n.path));
  const brokenLinks: BrokenLink[] = [];

  for (const note of notes) {
    graph.addNode({
      id: note.id,
      kind: "note",
      label: note.title,
      path: note.path,
    });
  }

  for (const note of notes) {
    for (const link of note.links) {
      const targetId = resolver.resolve(link.target);
      if (!targetId) {
        brokenLinks.push({ from: note.id, target: link.target });
        continue;
      }
      graph.addEdge({
        from: note.id,
        to: targetId,
        kind: link.embed ? "embed" : "link",
      });
    }

    for (const tag of note.tags) {
      const tagId = `#${tag}`;
      graph.addNode({ id: tagId, kind: "tag", label: tag });
      graph.addEdge({ from: note.id, to: tagId, kind: "tagged" });
    }
  }

  return { graph, resolver, brokenLinks };
}
