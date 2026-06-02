# Obsidian Second Brain

Connect an [Obsidian](https://obsidian.md) vault as an **AI memory graph**: parse your
notes and `[[wikilinks]]` into a knowledge graph, embed them for semantic recall, and
expose the whole thing to AI assistants over [MCP](https://modelcontextprotocol.io) — plus
a CLI for managing and optimizing the vault.

This is a TypeScript monorepo built around one shared engine (`@osb/core`) that every
surface reuses. **Phase 1** (this milestone) ships the engine, a CLI, and an MCP server.

## Packages

| Package | What it is |
| --- | --- |
| [`@osb/core`](packages/core) | Pure engine: vault parsing, knowledge graph, memory orchestration, optimizer. No native deps. |
| [`@osb/memory-node`](packages/memory-node) | Node memory backends: local embeddings (Transformers.js), JSON + sqlite-vec vector stores. |
| [`@osb/cli`](packages/cli) | `osb` command-line tool: index, search, recall, graph stats, optimize. |
| [`@osb/mcp-server`](packages/mcp-server) | stdio MCP server exposing the vault to AI assistants. |

> The Obsidian **plugin** and **web app** are planned for later phases. The `@osb/core`
> engine is already designed to be reused by both (file access sits behind a `VaultReader`
> interface; native deps are quarantined in `@osb/memory-node`).

## Architecture at a glance

```
VaultReader (interface)  ──▶  parse notes  ──▶  GraphModel (knowledge graph)
   │  NodeVaultReader (fs)                          │
   │  ObsidianVaultReader (plugin, later)           ├─▶ optimizer (orphans, broken links, …)
   ▼                                                ▼
MemoryService  ──▶  Embedder + VectorStore  ──▶  semantic recall / memory write-back
```

- **Embedder** (default `local`, Transformers.js `bge-small-en-v1.5`; or `api`, or `hash`)
  and **VectorStore** (default `json`; or `sqlite` via sqlite-vec) are swappable interfaces.
- Heavy/native dependencies (`@huggingface/transformers`, `better-sqlite3`, `sqlite-vec`) are
  **optional** and lazily loaded — the dependency-free `hash` embedder + `json` store always work.

## Quick start

```bash
pnpm install
pnpm build

# Point the CLI at a vault (defaults to local embeddings + a JSON index in <vault>/.osb)
node packages/cli/dist/index.js -v /path/to/vault graph        # graph stats
node packages/cli/dist/index.js -v /path/to/vault index        # build the semantic index
node packages/cli/dist/index.js -v /path/to/vault recall "..." # semantic search
node packages/cli/dist/index.js -v /path/to/vault optimize     # orphans / broken links / tags
```

Use `-e hash` for a dependency-free embedder (no model download), or `-e api` with
`OPENAI_API_KEY` set. Use `-s sqlite` to switch the store to sqlite-vec.

## MCP server

Expose the vault to Claude (or any MCP client). Example client config:

```json
{
  "mcpServers": {
    "obsidian-second-brain": {
      "command": "node",
      "args": ["/abs/path/packages/mcp-server/dist/index.js"],
      "env": { "OSB_VAULT": "/path/to/vault", "OSB_EMBEDDER": "local", "OSB_STORE": "json" }
    }
  }
}
```

Tools exposed: `get_note`, `get_backlinks`, `search_notes`, `semantic_search`,
`query_graph`, `create_note`. Run `osb index` (or `node packages/cli/dist/index.js … index`)
first so `semantic_search` has an index to query.

## Development

```bash
pnpm build       # turbo: build every package
pnpm test        # turbo: run vitest across packages
pnpm typecheck   # turbo: tsc --noEmit across packages
```

The sample vault used by the tests lives in
[`packages/core/test/fixtures/sample-vault`](packages/core/test/fixtures/sample-vault).
