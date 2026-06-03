import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { VaultContext } from "../src/VaultContext.js";

const sampleVault = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "sample-vault",
);

describe("VaultContext (read)", () => {
  const ctx = new VaultContext({ vaultDir: sampleVault });

  it("gets a note with parsed links and tags", async () => {
    const note = await ctx.getNote("Welcome");
    expect(note?.title).toBe("Welcome");
    expect(note?.links).toContain("Knowledge Graph");
    expect(note?.tags).toContain("start");
  });

  it("returns null for a missing note", async () => {
    expect(await ctx.getNote("Nope")).toBeNull();
  });

  it("reports backlinks", async () => {
    const links = await ctx.backlinks("Knowledge Graph");
    expect(links.map((l) => l.from).sort()).toEqual(["Welcome", "notes/Memory"]);
  });

  it("queries the graph around a note", async () => {
    const result = await ctx.queryGraph("Welcome", 1);
    expect(result.neighbors).toContain("Knowledge Graph");
  });
});

describe("VaultContext (write)", () => {
  let tmp: string;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates a note and invalidates the graph cache", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osb-ctx-"));
    await fs.writeFile(path.join(tmp, "Seed.md"), "# Seed\n\n[[New Memory]]\n");
    const ctx = new VaultContext({ vaultDir: tmp });

    expect((await ctx.graph()).byId.has("New Memory")).toBe(false);
    const result = await ctx.createNote({
      title: "New Memory",
      body: "Remembered fact.",
      folder: "memory",
    });
    expect(result.path).toBe("memory/new-memory.md");
    expect((await ctx.graph()).byId.has("memory/new-memory")).toBe(true);
  });

  it("appends under a heading and files a brain dump", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osb-ctx-"));
    await fs.mkdir(path.join(tmp, "Projects"), { recursive: true });
    await fs.writeFile(path.join(tmp, "Projects", "Vetos.md"), "# Vetos\n");
    const ctx = new VaultContext({ vaultDir: tmp });

    const written = await ctx.fileBrainDump({
      projectId: "Projects/Vetos",
      summary: "- New logo mark",
      source: "2026-06-02",
    });
    expect(written).toBe("Projects/Vetos.md");
    const content = await fs.readFile(path.join(tmp, "Projects", "Vetos.md"), "utf8");
    expect(content).toContain("## Log");
    expect(content).toContain("New logo mark");
    expect(content).toContain("Source: [[2026-06-02]]");
  });

  it("reads and updates the memory config", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osb-ctx-"));
    const ctx = new VaultContext({ vaultDir: tmp });

    expect((await ctx.getConfig()).autonomy).toBe("confirm");
    const updated = await ctx.setConfig({ autonomy: "auto", logHeading: "## Journal" });
    expect(updated.autonomy).toBe("auto");
    expect((await ctx.getConfig()).logHeading).toBe("## Journal");
    // Persisted to disk
    const onDisk = JSON.parse(
      await fs.readFile(path.join(tmp, ".osb", "config.json"), "utf8"),
    );
    expect(onDisk.autonomy).toBe("auto");
  });

  it("builds a portable memory context", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osb-ctx-"));
    await fs.mkdir(path.join(tmp, "Projects"), { recursive: true });
    await fs.writeFile(path.join(tmp, "Projects", "Vetos.md"), "# Vetos\n\nBranding.\n");
    const ctx = new VaultContext({ vaultDir: tmp });
    const context = await ctx.getMemoryContext();
    expect(context).toContain("READ THIS FIRST");
    expect(context).toContain("**Vetos**");
  });
});
