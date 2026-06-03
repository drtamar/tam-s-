import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VaultContext, type VaultContextOptions } from "./VaultContext.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Build the MCP server with every Phase-1 tool registered against a vault. */
export function createServer(options: VaultContextOptions): McpServer {
  const ctx = new VaultContext(options);
  const server = new McpServer({ name: "obsidian-second-brain", version: "0.1.0" });

  server.registerTool(
    "get_note",
    {
      description:
        "Fetch a note by id (path without .md) with its frontmatter title, tags, outgoing links, and body.",
      inputSchema: { id: z.string().describe("Note id, e.g. 'folder/Note'") },
    },
    async ({ id }) => {
      const note = await ctx.getNote(id);
      return note ? json(note) : json({ error: `Note not found: ${id}` });
    },
  );

  server.registerTool(
    "get_backlinks",
    {
      description: "List notes that link to the given note.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await ctx.backlinks(id)),
  );

  server.registerTool(
    "search_notes",
    {
      description: "Full-text search over note titles, tags, and body.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(100).default(20),
      },
    },
    async ({ query, limit }) => json(await ctx.search(query, limit)),
  );

  server.registerTool(
    "semantic_search",
    {
      description:
        "Semantic recall over the indexed vault. Returns the most relevant note chunks. Requires the vault to be indexed first.",
      inputSchema: {
        query: z.string(),
        k: z.number().int().positive().max(50).default(5),
      },
    },
    async ({ query, k }) => json(await ctx.semanticSearch(query, k)),
  );

  server.registerTool(
    "query_graph",
    {
      description:
        "Explore the knowledge graph around a note: neighbors within a depth and its backlinks.",
      inputSchema: {
        id: z.string(),
        depth: z.number().int().positive().max(4).default(1),
      },
    },
    async ({ id, depth }) => json(await ctx.queryGraph(id, depth)),
  );

  server.registerTool(
    "list_projects",
    {
      description:
        "List the projects and life-areas the second memory system can route brain dumps into.",
      inputSchema: {},
    },
    async () => json(await ctx.listProjects()),
  );

  server.registerTool(
    "route_braindump",
    {
      description:
        "Second memory system: classify a brain dump to the best-matching project/area and return a summarized, routable proposal (does not write). Requires an LLM API key configured on the server.",
      inputSchema: {
        text: z.string().describe("The raw brain dump text"),
        source: z.string().optional().describe("Optional source note id to link back to"),
      },
    },
    async ({ text, source }) => json(await ctx.routeBrainDump(text, source)),
  );

  server.registerTool(
    "append_to_note",
    {
      description:
        "Append text under a heading in a note (creating the note/section if needed). The core memory-management write — use it to file a summary you wrote into a project's log or About Me.",
      inputSchema: {
        path: z.string().describe("Vault-relative note path, e.g. 'Projects/Vetos.md'"),
        text: z.string().describe("Markdown to append"),
        heading: z.string().optional().describe("Target heading; defaults to the configured log heading"),
      },
    },
    async ({ path, text, heading }) => json({ written: await ctx.appendToNote(path, text, heading) }),
  );

  server.registerTool(
    "file_braindump",
    {
      description:
        "File a brain dump you have already classified: appends a dated, optionally backlinked summary under the target project/area's log. Use after deciding the destination yourself (no server-side LLM needed).",
      inputSchema: {
        projectId: z.string().describe("Target collection id (path without .md), e.g. 'Projects/Vetos'"),
        summary: z.string().describe("The concise summary to file"),
        source: z.string().optional().describe("Optional source note id to backlink"),
      },
    },
    async ({ projectId, summary, source }) =>
      json({ written: await ctx.fileBrainDump({ projectId, summary, source }) }),
  );

  server.registerTool(
    "get_memory_context",
    {
      description:
        "Return the portable, LLM-agnostic memory loader (About Me + active projects/areas) — a digest any LLM can be primed with.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text" as const, text: await ctx.getMemoryContext() }] }),
  );

  server.registerTool(
    "review_vault",
    {
      description:
        "Run a full-vault review/organize pass: optimizer proposals (orphans, broken links, tags), route inbox captures into projects/areas, and regenerate the memory loader. Set apply=true to write changes.",
      inputSchema: {
        apply: z.boolean().default(false).describe("Write routing entries + the memory loader"),
      },
    },
    async ({ apply }) => json(await ctx.reviewVault(apply)),
  );

  server.registerTool(
    "get_config",
    {
      description: "Read the memory-management policy (the 'what / how / why' settings).",
      inputSchema: {},
    },
    async () => json(await ctx.getConfig()),
  );

  server.registerTool(
    "set_config",
    {
      description:
        "Update the memory-management policy. Pass only the fields to change (merged over the current config).",
      inputSchema: {
        config: z.record(z.unknown()).describe("Partial MemoryConfig to merge"),
      },
    },
    async ({ config }) =>
      json(await ctx.setConfig(config as Partial<import("@osb/core").MemoryConfig>)),
  );

  server.registerTool(
    "create_note",
    {
      description:
        "Write a new note into the vault (AI memory write-back). Returns the created path.",
      inputSchema: {
        title: z.string(),
        body: z.string(),
        folder: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ title, body, folder, tags }) =>
      json(await ctx.createNote({ title, body, folder, tags })),
  );

  return server;
}
