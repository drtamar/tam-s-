import type { BrokenLink } from "../graph/buildGraph.js";

/** Broken-link proposal: a wikilink whose target doesn't exist. */
export interface BrokenLinkProposal {
  from: string;
  target: string;
  suggestion: "create-note" | "fix-link";
}

/**
 * Turn raw broken links (collected during graph build) into proposals. Targets
 * that look like a note name are suggested for creation; everything else is a
 * fix-the-link candidate.
 */
export function proposeBrokenLinks(broken: BrokenLink[]): BrokenLinkProposal[] {
  return broken.map((b) => ({
    from: b.from,
    target: b.target,
    suggestion: /[\\/]/.test(b.target) ? "fix-link" : "create-note",
  }));
}
