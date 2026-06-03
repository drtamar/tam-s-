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
| [`@osb/cli`](packages/cli) | `osb` command-line tool: index, search, recall, graph, optimize, route, organize, context, sync. |
| [`@osb/mcp-server`](packages/mcp-server) | stdio MCP server exposing the vault to Claude / any MCP client. |
| [`@osb/obsidian-plugin`](packages/obsidian-plugin) | Obsidian plugin (desktop + **Android**): route brain dumps, build the memory loader. |

> The same `@osb/core` engine powers every surface — file access sits behind a `VaultReader`
> interface, and Node-only deps are quarantined in `@osb/memory-node`, so the Obsidian bundle stays
> mobile-safe. A web app is the remaining planned surface.

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
   **project or life-area**, writes a concise summary, and appends a dated, linked entry under that
   note's `## Log`. When nothing fits, it can **create a new project/area** note. Personal
   ("About Me") captures are kept separate from project/area updates.

```bash
# Dry-run: classify captures in the inbox against your projects + areas
node packages/cli/dist/index.js -v /path/to/vault route

# Route a single thought and write it into the matched note's log
node packages/cli/dist/index.js -v /path/to/vault route --dump "Vetos logo: alien-planet, one-color vector mark" --apply
```

Set `OPENAI_API_KEY` (or set `llm.provider: anthropic` in config with `ANTHROPIC_API_KEY`).

## Unify across LLMs + organize the whole vault

- **Portable memory loader** — `osb context` assembles an LLM-agnostic digest (About Me + active
  projects/areas) you can paste into *any* LLM (ChatGPT, Gemini, …). `--write` saves it to the
  configured `memoryLoaderNote`.
- **Full-vault review** — `osb organize` reviews everything: optimizer checks (orphans, broken links,
  tags), routes inbox captures into projects/areas (auto-creating where the policy allows), and
  regenerates the memory loader. `--apply` writes changes; otherwise it's a dry run.

```bash
node packages/cli/dist/index.js -v /path/to/vault context --write
node packages/cli/dist/index.js -v /path/to/vault organize --apply
```

## Memory policy — the "what / how / why" settings

Behavior is governed by `MemoryConfig`, stored at `<vault>/.osb/config.json` (sensible defaults if
absent; over MCP use `get_config` / `set_config`). Highlights:

- **what:** `projectsFolder`, `areasFolder`, `aboutMeNote`, `inboxFolder`, `memoryLoaderNote`,
  `classifierGuidance`.
- **how:** `logHeading`, `autonomy` (`auto`/`confirm`), `autoCreate` (`off`/`propose`/`auto`),
  `minConfidence`, `summaryStyle`, `explainRouting`, `contextTokenBudget`.
- **why:** `purpose`; plus `llm` (provider/model) and `drive` (folder id / service-account path).

## Google Drive vault (service-account sync)

If your vault lives in Google Drive, mirror it locally, run the engine, and push changes back. Full
walkthrough in [docs/google-drive-setup.md](docs/google-drive-setup.md):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   # account must have vault access
node packages/cli/dist/index.js sync pull --root <DRIVE_FOLDER_ID> --local ./vault
# ... organize / route / context against ./vault ...
node packages/cli/dist/index.js sync push --root <DRIVE_FOLDER_ID> --local ./vault
```

`googleapis` is an optional dependency loaded only when you sync. The sync keeps a manifest under
`.osb/drive-manifest.json` to map local paths to Drive file ids and detect changes.

## Use it as a Claude plugin (MCP)

Expose the vault to Claude so Claude itself creates and manages your memory.

**Claude Desktop** — add to `claude_desktop_config.json`:

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

**Claude Code** — add the same server block to a project `.mcp.json`.

Tools exposed: `get_note`, `get_backlinks`, `search_notes`, `semantic_search`, `query_graph`,
`list_projects`, `route_braindump`, **`append_to_note`**, **`file_braindump`**,
**`get_memory_context`**, **`review_vault`**, **`get_config`** / **`set_config`**, `create_note`.

When **Claude drives the MCP it is the classifier** — it reads `list_projects` / `get_memory_context`,
decides, and writes with `append_to_note` / `file_braindump`, so no extra LLM key is needed. Run
`osb index` first for `semantic_search`; an LLM key is only needed for the server-side
`route_braindump` / `review_vault` routing.

## Development

```bash
pnpm build       # turbo: build every package
pnpm test        # turbo: run vitest across packages
pnpm typecheck   # turbo: tsc --noEmit across packages
```

The sample vault used by the tests lives in
[`packages/core/test/fixtures/sample-vault`](packages/core/test/fixtures/sample-vault).
