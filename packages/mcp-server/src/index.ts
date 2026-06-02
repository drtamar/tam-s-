#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import type { EmbedderKind, StoreKind } from "@osb/memory-node";

/**
 * Entry point for the stdio MCP server.
 *
 * Configure the vault via `OSB_VAULT` (or the first CLI arg). Optional env:
 * `OSB_EMBEDDER` = local | api | hash, `OSB_STORE` = json | sqlite.
 */
async function main(): Promise<void> {
  const vaultDir = process.env.OSB_VAULT ?? process.argv[2];
  if (!vaultDir) {
    console.error("Set OSB_VAULT (or pass the vault path as the first argument).");
    process.exit(1);
  }

  const server = createServer({
    vaultDir,
    embedder: process.env.OSB_EMBEDDER as EmbedderKind | undefined,
    store: process.env.OSB_STORE as StoreKind | undefined,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server now runs until stdin closes.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
