import type { NoteId } from "../vault/types.js";
import type { GraphModel } from "./GraphModel.js";

/**
 * Notes with no incoming or outgoing *link* edges (tags don't count). These are
 * the disconnected islands of a vault — prime candidates for the optimizer.
 */
export function findOrphans(graph: GraphModel): NoteId[] {
  const orphans: NoteId[] = [];
  for (const node of graph.noteNodes()) {
    const linked =
      graph
        .outgoing(node.id)
        .some((e) => e.kind === "link" || e.kind === "embed") ||
      graph.incoming(node.id).some((e) => e.kind === "link" || e.kind === "embed");
    if (!linked) orphans.push(node.id);
  }
  return orphans.sort();
}

/** Breadth-first subgraph: note ids within `depth` hops of `start`. */
export function subgraph(
  graph: GraphModel,
  start: NoteId,
  depth = 1,
): NoteId[] {
  const seen = new Set<NoteId>([start]);
  let frontier: NoteId[] = [start];
  for (let d = 0; d < depth; d++) {
    const next: NoteId[] = [];
    for (const id of frontier) {
      for (const n of graph.neighbors(id)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  seen.delete(start);
  return [...seen];
}

/** Shortest path (inclusive of endpoints) between two notes, or null. */
export function shortestPath(
  graph: GraphModel,
  from: NoteId,
  to: NoteId,
): NoteId[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const queue: string[] = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const n of graph.neighbors(cur)) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let step = to;
        while (prev.has(step)) {
          step = prev.get(step) as string;
          path.unshift(step);
        }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}
