import type { VaultReader } from "../vault/VaultReader.js";
import type { NoteId, NotePath } from "../vault/types.js";
import type { MemoryConfig } from "../config/MemoryConfig.js";
import type { LlmClient, RoutingProposal } from "../projects/types.js";
import { loadVault } from "../loadVault.js";
import { loadCollections } from "../projects/loadProjects.js";
import { extractDumpsFromFolder } from "../projects/extract.js";
import { BrainDumpRouter, routerOptionsFromConfig } from "../projects/router.js";
import { proposeOrphans, type OrphanProposal } from "../optimize/orphans.js";
import { proposeBrokenLinks, type BrokenLinkProposal } from "../optimize/brokenLinks.js";
import { proposeTagNormalization, type TagNormalizeProposal } from "../optimize/tagNormalize.js";
import { proposeDuplicates, type DuplicateProposal } from "../optimize/duplicates.js";
import { buildMemoryContext } from "./memoryContext.js";

export interface OrganizeOptions {
  config: MemoryConfig;
  /** Enables routing of inbox captures into projects/areas. */
  llm?: LlmClient;
  /** Note embeddings — enables duplicate detection when supplied. */
  vectors?: Map<NoteId, number[]>;
  /** Write changes back (route entries + regenerate memory loader). */
  apply?: boolean;
}

export interface RoutedOutcome {
  proposal: RoutingProposal;
  appliedTo: NotePath | null;
}

export interface OrganizeReport {
  orphans: OrphanProposal[];
  brokenLinks: BrokenLinkProposal[];
  tagNormalization: TagNormalizeProposal[];
  duplicates: DuplicateProposal[];
  routed: RoutedOutcome[];
  memoryContext: string;
  memoryLoaderWritten: NotePath | null;
}

/**
 * One full-vault review/organize pass: surfaces optimizer proposals (orphans,
 * broken links, tag normalization, and — when embeddings are supplied —
 * duplicates), routes inbox captures into projects/areas (auto-creating where
 * the policy allows), and regenerates the portable memory loader. With
 * `apply`, routing entries are written and the loader is saved; otherwise it is
 * a dry run that only reports.
 */
export async function organizeVault(
  vault: VaultReader,
  options: OrganizeOptions,
): Promise<OrganizeReport> {
  const { config, llm, vectors, apply = false } = options;
  const loaded = await loadVault(vault);
  const tags = [...new Set(loaded.notes.flatMap((n) => n.tags))];

  const report: OrganizeReport = {
    orphans: proposeOrphans(loaded.graph),
    brokenLinks: proposeBrokenLinks(loaded.brokenLinks),
    tagNormalization: proposeTagNormalization(tags),
    duplicates: vectors ? proposeDuplicates(vectors) : [],
    routed: [],
    memoryContext: "",
    memoryLoaderWritten: null,
  };

  // Route inbox captures (only when an LLM classifier is available).
  if (llm) {
    const collections = await loadCollections(
      vault,
      config.projectsFolder,
      config.areasFolder,
    );
    const router = new BrainDumpRouter(vault, llm, routerOptionsFromConfig(config));
    const dumps = await extractDumpsFromFolder(vault, config.inboxFolder);
    for (const dump of dumps) {
      const proposal = await router.route(dump, collections);
      const appliedTo = apply ? await router.apply(proposal) : null;
      report.routed.push({ proposal, appliedTo });
    }
  }

  // Regenerate the portable memory loader.
  report.memoryContext = await buildMemoryContext(vault, config);
  if (apply) {
    await vault.write(config.memoryLoaderNote, report.memoryContext);
    report.memoryLoaderWritten = config.memoryLoaderNote;
  }

  return report;
}
