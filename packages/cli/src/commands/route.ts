import {
  BrainDumpRouter,
  NodeVaultReader,
  createLlmClient,
  dumpFromText,
  extractDumpsFromFolder,
  loadCollections,
  routerOptionsFromConfig,
  type BrainDump,
  type RoutingProposal,
} from "@osb/core";
import { loadMemoryConfig } from "@osb/memory-node";

export interface RouteFlags {
  vault: string;
  inbox?: string;
  dump?: string;
  apply?: boolean;
}

export interface RouteOutcome {
  proposal: RoutingProposal;
  appliedTo: string | null;
}

/**
 * The second memory system from the CLI: classify brain dumps (a single
 * `--dump` string, or every note in the inbox folder) to projects/areas and,
 * with `--apply`, append summaries under each collection's log.
 */
export async function routeBrainDumps(flags: RouteFlags): Promise<RouteOutcome[]> {
  const vault = new NodeVaultReader(flags.vault);
  const config = await loadMemoryConfig(flags.vault);
  const collections = await loadCollections(vault, config.projectsFolder, config.areasFolder);
  const llm = createLlmClient(config.llm.provider);
  const router = new BrainDumpRouter(vault, llm, routerOptionsFromConfig(config));

  const dumps: BrainDump[] = flags.dump
    ? [dumpFromText(flags.dump)]
    : await extractDumpsFromFolder(vault, flags.inbox ?? config.inboxFolder);

  const outcomes: RouteOutcome[] = [];
  for (const dump of dumps) {
    const proposal = await router.route(dump, collections);
    const appliedTo = flags.apply ? await router.apply(proposal) : null;
    outcomes.push({ proposal, appliedTo });
  }
  return outcomes;
}

export function formatRouteOutcomes(outcomes: RouteOutcome[]): string {
  if (outcomes.length === 0) return "No brain dumps found.";
  return outcomes
    .map(({ proposal: p, appliedTo }) => {
      const target =
        p.projectId ??
        (p.newNote ? `${p.newNote.kind}: ${p.newNote.title} (new)` : p.category);
      const status = appliedTo ? `→ wrote ${appliedTo}` : "(dry-run)";
      return [
        `• ${p.dumpId}  [${p.category} ${(p.confidence * 100).toFixed(0)}%]  ${target}  ${status}`,
        p.summary
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n"),
      ].join("\n");
    })
    .join("\n\n");
}
