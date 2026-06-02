import {
  NodeVaultReader,
  findOrphans,
  loadVault,
  proposeBrokenLinks,
} from "@osb/core";

export interface GraphStats {
  notes: number;
  tags: number;
  links: number;
  orphans: number;
  brokenLinks: number;
}

/** Compute high-level graph statistics for a vault. */
export async function graphStats(vaultDir: string): Promise<GraphStats> {
  const loaded = await loadVault(new NodeVaultReader(vaultDir));
  const tags = [...loaded.graph.nodes.values()].filter((n) => n.kind === "tag");
  const links = loaded.graph.edges.filter(
    (e) => e.kind === "link" || e.kind === "embed",
  );
  return {
    notes: loaded.graph.noteNodes().length,
    tags: tags.length,
    links: links.length,
    orphans: findOrphans(loaded.graph).length,
    brokenLinks: proposeBrokenLinks(loaded.brokenLinks).length,
  };
}

export function formatGraphStats(stats: GraphStats): string {
  return [
    `Notes:        ${stats.notes}`,
    `Tags:         ${stats.tags}`,
    `Links:        ${stats.links}`,
    `Orphans:      ${stats.orphans}`,
    `Broken links: ${stats.brokenLinks}`,
  ].join("\n");
}
