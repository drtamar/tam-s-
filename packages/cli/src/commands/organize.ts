import {
  NodeVaultReader,
  buildMemoryContext,
  createLlmClient,
  organizeVault,
  type OrganizeReport,
} from "@osb/core";
import { loadMemoryConfig } from "@osb/memory-node";

/** Build (and optionally write) the portable memory loader. */
export async function buildContext(vaultDir: string, write: boolean): Promise<string> {
  const vault = new NodeVaultReader(vaultDir);
  const config = await loadMemoryConfig(vaultDir);
  const context = await buildMemoryContext(vault, config);
  if (write) await vault.write(config.memoryLoaderNote, context);
  return context;
}

/** Full-vault review/organize pass. */
export async function organize(vaultDir: string, apply: boolean): Promise<OrganizeReport> {
  const vault = new NodeVaultReader(vaultDir);
  const config = await loadMemoryConfig(vaultDir);
  let llm;
  try {
    llm = createLlmClient(config.llm.provider);
  } catch {
    llm = undefined; // no API key — still report optimizer + build loader
  }
  return organizeVault(vault, { config, llm, apply });
}

export function formatOrganizeReport(report: OrganizeReport): string {
  const lines: string[] = [];
  lines.push(`Orphans: ${report.orphans.length}`);
  lines.push(`Broken links: ${report.brokenLinks.length}`);
  lines.push(`Tag normalizations: ${report.tagNormalization.length}`);
  lines.push(`Duplicate pairs: ${report.duplicates.length}`);
  lines.push(`Routed captures: ${report.routed.length}`);
  for (const { proposal: p, appliedTo } of report.routed) {
    const target = p.projectId ?? (p.newNote ? `${p.newNote.kind}:${p.newNote.title}` : p.category);
    lines.push(`  • ${p.dumpId} → ${target} ${appliedTo ? `(wrote ${appliedTo})` : "(dry-run)"}`);
  }
  lines.push(report.memoryLoaderWritten ? `Memory loader: wrote ${report.memoryLoaderWritten}` : "Memory loader: (dry-run)");
  return lines.join("\n");
}
