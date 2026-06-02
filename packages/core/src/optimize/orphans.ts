import type { GraphModel } from "../graph/GraphModel.js";
import { findOrphans } from "../graph/queries.js";

/** Orphan proposal: a note disconnected from the link graph. */
export interface OrphanProposal {
  noteId: string;
  reason: "no-links";
}

/** Report orphan notes as read-only proposals. */
export function proposeOrphans(graph: GraphModel): OrphanProposal[] {
  return findOrphans(graph).map((noteId) => ({ noteId, reason: "no-links" }));
}
