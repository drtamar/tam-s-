#!/usr/bin/env node
import { Command } from "commander";
import {
  NodeVaultReader,
  getBacklinks,
  loadVault,
  searchNotes,
} from "@osb/core";
import type { EmbedderKind, StoreKind } from "@osb/memory-node";
import { createMemory } from "./context.js";
import { formatGraphStats, graphStats } from "./commands/graph.js";
import { formatOptimizeReport, optimizeVault } from "./commands/optimize.js";

interface GlobalOpts {
  vault: string;
  embedder: EmbedderKind;
  store: StoreKind;
}

const program = new Command();

program
  .name("osb")
  .description("Obsidian second brain: knowledge graph + AI memory over your vault.")
  .version("0.1.0")
  .option("-v, --vault <dir>", "path to the Obsidian vault", process.cwd())
  .option("-e, --embedder <kind>", "embedder: local | api | hash", "local")
  .option("-s, --store <kind>", "vector store: json | sqlite", "json");

function globals(): GlobalOpts {
  return program.opts<GlobalOpts>();
}

program
  .command("index")
  .description("Build/refresh the semantic index for the vault")
  .option("-f, --force", "reindex every note", false)
  .action(async (opts: { force: boolean }) => {
    const g = globals();
    const { memory } = createMemory(g);
    const result = await memory.indexVault({ force: opts.force });
    console.log(
      `Indexed ${result.notesIndexed} note(s), skipped ${result.notesSkipped}, ` +
        `wrote ${result.chunksWritten} chunk(s).`,
    );
  });

program
  .command("graph")
  .description("Show knowledge-graph statistics")
  .action(async () => {
    console.log(formatGraphStats(await graphStats(globals().vault)));
  });

program
  .command("search <query>")
  .description("Full-text search over note titles, tags, and body")
  .option("-n, --limit <n>", "max results", "10")
  .action(async (query: string, opts: { limit: string }) => {
    const loaded = await loadVault(new NodeVaultReader(globals().vault));
    const hits = searchNotes(loaded.notes, query, Number(opts.limit));
    if (hits.length === 0) console.log("No matches.");
    for (const n of hits) console.log(`- ${n.id}`);
  });

program
  .command("recall <query>")
  .description("Semantic recall over the indexed vault")
  .option("-k, --top <n>", "number of results", "5")
  .action(async (query: string, opts: { top: string }) => {
    const { memory } = createMemory(globals());
    const hits = await memory.recall(query, Number(opts.top));
    if (hits.length === 0) {
      console.log("No results. Did you run `osb index` first?");
      return;
    }
    for (const h of hits) {
      const where = h.headingPath ? `${h.noteId} › ${h.headingPath}` : h.noteId;
      console.log(`\n[${h.score.toFixed(3)}] ${where}`);
      console.log(`  ${h.text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  });

program
  .command("backlinks <noteId>")
  .description("List notes linking to a given note")
  .action(async (noteId: string) => {
    const loaded = await loadVault(new NodeVaultReader(globals().vault));
    const links = getBacklinks(loaded.graph, noteId);
    if (links.length === 0) console.log("No backlinks.");
    for (const l of links) console.log(`- ${l.from} (${l.kind})`);
  });

program
  .command("optimize")
  .description("Report vault health: orphans, broken links, tag variants")
  .option("--orphans", "only orphan notes")
  .option("--broken-links", "only broken links")
  .option("--tags", "only tag normalization")
  .action(async (opts: { orphans?: boolean; brokenLinks?: boolean; tags?: boolean }) => {
    const report = await optimizeVault(globals().vault, {
      orphans: opts.orphans,
      brokenLinks: opts.brokenLinks,
      tags: opts.tags,
    });
    console.log(formatOptimizeReport(report));
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
