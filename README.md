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
| [`@osb/drive`](packages/drive) | Sync the vault between Google Drive and a local folder, so the engine runs on local files. |
| [`@osb/cli`](packages/cli) | `osb` command-line tool: index, search, recall, graph stats, optimize, route, sync. |
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

## Two memory systems

1. **Semantic memory** (`MemoryService`) — embeds notes for fuzzy recall (`osb index` / `osb recall`).
2. **Brain-dump router** (`BrainDumpRouter`) — the *second* memory system. It takes quick captures
   (a daily/inbox note, or a one-off line), uses an LLM to classify each to the best-matching
   **project**, writes a concise summary, and appends a dated, linked entry under that project's
   `## Log`. Personal ("About Me") captures are kept separate from project updates.

```bash
# Dry-run: classify captures in the Inbox folder against the Projects folder
node packages/cli/dist/index.js -v /path/to/vault route --inbox Inbox --projects Projects --llm openai

# Route a single thought and write it into the matched project's log
node packages/cli/dist/index.js -v /path/to/vault route --dump "Vetos logo: alien-planet, one-color vector mark" --apply
```

Set `OPENAI_API_KEY` (or `--llm anthropic` with `ANTHROPIC_API_KEY`) for classification.

## Google Drive vault (local sync)

If your vault lives in Google Drive, mirror it locally, run the engine, and push changes back:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   # account must have vault access
node packages/cli/dist/index.js sync pull --root <DRIVE_FOLDER_ID> --local ./vault
# ... index / recall / route against ./vault ...
node packages/cli/dist/index.js sync push --root <DRIVE_FOLDER_ID> --local ./vault
```

`googleapis` is an optional dependency loaded only when you sync. The sync keeps a manifest under
`.osb/drive-manifest.json` to map local paths to Drive file ids and detect changes.

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
`query_graph`, `create_note`, `list_projects`, `route_braindump`. Run `osb index` first so
`semantic_search` has an index to query; set an LLM key (`OPENAI_API_KEY` / `OSB_LLM`) for
`route_braindump`.

## Development

```bash
pnpm build       # turbo: build every package
pnpm test        # turbo: run vitest across packages
pnpm typecheck   # turbo: tsc --noEmit across packages
```

The sample vault used by the tests lives in
[`packages/core/test/fixtures/sample-vault`](packages/core/test/fixtures/sample-vault).
