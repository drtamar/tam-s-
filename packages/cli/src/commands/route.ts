import {
  BrainDumpRouter,
  NodeVaultReader,
  dumpFromText,
  extractDumpsFromFolder,
  loadProjects,
  type BrainDump,
  type RoutingProposal,
} from "@osb/core";
import { createLlmClient, type LlmKind } from "@osb/memory-node";

export interface RouteFlags {
  vault: string;
  projects?: string;
  inbox?: string;
  dump?: string;
  llm?: LlmKind;
  apply?: boolean;
}

export interface RouteOutcome {
  proposal: RoutingProposal;
  appliedTo: string | null;
}

/**
 * The second memory system from the CLI: classify brain dumps (a single
 * `--dump` string, or every note in an `--inbox` folder) to projects and, with
 * `--apply`, append summaries under each project's log.
 */
export async function routeBrainDumps(flags: RouteFlags): Promise<RouteOutcome[]> {
  const vault = new NodeVaultReader(flags.vault);
  const projects = await loadProjects(vault, flags.projects ?? "Projects");
  const llm = createLlmClient(flags.llm ?? "openai");
  const router = new BrainDumpRouter(vault, llm);

  const dumps: BrainDump[] = flags.dump
    ? [dumpFromText(flags.dump)]
    : await extractDumpsFromFolder(vault, flags.inbox ?? "Inbox");

  const outcomes: RouteOutcome[] = [];
  for (const dump of dumps) {
    const proposal = await router.route(dump, projects);
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
        p.category === "project" ? p.projectId : p.category === "about-me" ? "About Me" : "(unrouted)";
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
