import {
  NodeVaultReader,
  loadVault,
  proposeBrokenLinks,
  proposeOrphans,
  proposeTagNormalization,
  type BrokenLinkProposal,
  type OrphanProposal,
  type TagNormalizeProposal,
} from "@osb/core";

export interface OptimizeReport {
  orphans: OrphanProposal[];
  brokenLinks: BrokenLinkProposal[];
  tagNormalization: TagNormalizeProposal[];
}

export interface OptimizeFlags {
  orphans?: boolean;
  brokenLinks?: boolean;
  tags?: boolean;
}

/**
 * Run read-only optimizer checks. With no flags, runs all of them. These are
 * proposals only — nothing is written to the vault.
 */
export async function optimizeVault(
  vaultDir: string,
  flags: OptimizeFlags = {},
): Promise<OptimizeReport> {
  const all = !flags.orphans && !flags.brokenLinks && !flags.tags;
  const loaded = await loadVault(new NodeVaultReader(vaultDir));
  const tags = [...new Set(loaded.notes.flatMap((n) => n.tags))];
  return {
    orphans: all || flags.orphans ? proposeOrphans(loaded.graph) : [],
    brokenLinks:
      all || flags.brokenLinks ? proposeBrokenLinks(loaded.brokenLinks) : [],
    tagNormalization: all || flags.tags ? proposeTagNormalization(tags) : [],
  };
}

export function formatOptimizeReport(report: OptimizeReport): string {
  const lines: string[] = [];
  lines.push(`Orphans (${report.orphans.length}):`);
  for (const o of report.orphans) lines.push(`  - ${o.noteId}`);
  lines.push(`Broken links (${report.brokenLinks.length}):`);
  for (const b of report.brokenLinks) {
    lines.push(`  - ${b.from} -> [[${b.target}]] (${b.suggestion})`);
  }
  lines.push(`Tag normalization (${report.tagNormalization.length}):`);
  for (const t of report.tagNormalization) {
    lines.push(`  - ${t.variants.join(", ")} -> ${t.canonical}`);
  }
  return lines.join("\n");
}
