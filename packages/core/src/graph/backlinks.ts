import type { NoteId } from "../vault/types.js";
import type { GraphModel } from "./GraphModel.js";

/** Notes that link to `id`, together with how they reference it. */
export interface Backlink {
  from: NoteId;
  kind: "link" | "embed";
}

/** Collect the backlinks (incoming link/embed edges) for a note. */
export function getBacklinks(graph: GraphModel, id: NoteId): Backlink[] {
  return graph
    .incoming(id)
    .filter((e) => e.kind === "link" || e.kind === "embed")
    .map((e) => ({ from: e.from, kind: e.kind as "link" | "embed" }));
}
