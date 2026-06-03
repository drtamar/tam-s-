import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import { buildMemoryContext } from "../src/organize/memoryContext.js";
import { organizeVault } from "../src/organize/organizeVault.js";
import { resolveConfig } from "../src/config/MemoryConfig.js";
import type { LlmClient } from "../src/projects/types.js";

let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

async function setupVault(): Promise<NodeVaultReader> {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-org-"));
  for (const d of ["Projects", "Areas", "Inbox"]) {
    await fs.mkdir(path.join(dir, d), { recursive: true });
  }
  await fs.writeFile(path.join(dir, "About Me.md"), "# About Me\n\nName: Tam. Visual thinker.\n");
  await fs.writeFile(path.join(dir, "Projects", "Vetos.md"), "# Vetos\n\nBranding & logo, alien-planet style.\n");
  await fs.writeFile(path.join(dir, "Areas", "Health.md"), "# Health\n\nRunning and sleep.\n");
  await fs.writeFile(path.join(dir, "Inbox", "capture.md"), "Logo idea: one-color vector mark.\n");
  return new NodeVaultReader(dir);
}

describe("buildMemoryContext", () => {
  it("produces a portable digest with About Me, projects, and areas", async () => {
    const vault = await setupVault();
    const ctx = await buildMemoryContext(vault, resolveConfig());
    expect(ctx).toContain("READ THIS FIRST");
    expect(ctx).toContain("Name: Tam");
    expect(ctx).toContain("**Vetos**");
    expect(ctx).toContain("**Health**");
    expect(ctx).toContain("1 project(s), 1 area(s)");
  });

  it("scales the digest with the token budget", async () => {
    const vault = await setupVault();
    await fs.writeFile(path.join(dir, "About Me.md"), `# About Me\n\n${"x".repeat(4000)}\n`);
    const small = await buildMemoryContext(vault, resolveConfig({ contextTokenBudget: 100 }));
    const big = await buildMemoryContext(vault, resolveConfig({ contextTokenBudget: 5000 }));
    expect(small.length).toBeLessThan(big.length);
    expect(small.length).toBeLessThanOrEqual(100 * 4 + 4);
  });
});

describe("organizeVault", () => {
  it("routes inbox captures and writes the memory loader on apply", async () => {
    const vault = await setupVault();
    const llm: LlmClient = {
      model: "stub",
      async complete() {
        return JSON.stringify({
          category: "project",
          projectId: "Projects/Vetos",
          confidence: 0.9,
          summary: "- One-color vector mark idea",
        });
      },
    };
    const report = await organizeVault(vault, { config: resolveConfig(), llm, apply: true });

    expect(report.routed).toHaveLength(1);
    expect(report.routed[0]?.appliedTo).toBe("Projects/Vetos.md");
    expect(await vault.read("Projects/Vetos.md")).toContain("vector mark idea");

    expect(report.memoryLoaderWritten).toBe("Master Memory Loader.md");
    expect(await vault.read("Master Memory Loader.md")).toContain("Active Projects");
  });

  it("is a dry run without apply (no writes)", async () => {
    const vault = await setupVault();
    const report = await organizeVault(vault, { config: resolveConfig() });
    expect(report.memoryLoaderWritten).toBeNull();
    expect(await vault.exists("Master Memory Loader.md")).toBe(false);
    expect(report.memoryContext).toContain("**Vetos**");
  });
});
