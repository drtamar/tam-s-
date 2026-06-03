import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import { loadCollections } from "../src/projects/loadProjects.js";
import { BrainDumpRouter } from "../src/projects/router.js";
import { resolveConfig } from "../src/config/MemoryConfig.js";
import { routerOptionsFromConfig } from "../src/projects/router.js";
import type { LlmClient } from "../src/projects/types.js";

let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

async function setupVault(): Promise<NodeVaultReader> {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-areas-"));
  await fs.mkdir(path.join(dir, "Projects"), { recursive: true });
  await fs.mkdir(path.join(dir, "Areas"), { recursive: true });
  await fs.writeFile(path.join(dir, "Projects", "Vetos.md"), "# Vetos\n\nBranding & logo.\n");
  await fs.writeFile(path.join(dir, "Areas", "Health.md"), "# Health\n\nFitness, sleep, running.\n");
  return new NodeVaultReader(dir);
}

/** Stub LLM that echoes a canned decision based on the dump text. */
function stub(decisionFor: (dump: string) => object): LlmClient {
  return {
    model: "stub",
    async complete({ prompt }) {
      const dump = prompt.split("Brain dump:")[1] ?? prompt;
      return JSON.stringify(decisionFor(dump));
    },
  };
}

describe("router — areas + auto-create", () => {
  it("loads projects and areas as one collection list with kinds", async () => {
    const vault = await setupVault();
    const cols = await loadCollections(vault, "Projects", "Areas");
    expect(cols.map((c) => `${c.kind}:${c.title}`).sort()).toEqual([
      "area:Health",
      "project:Vetos",
    ]);
  });

  it("files a dump into a matched life-area", async () => {
    const vault = await setupVault();
    const cols = await loadCollections(vault, "Projects", "Areas");
    const router = new BrainDumpRouter(
      vault,
      stub(() => ({ category: "area", projectId: "Areas/Health", confidence: 0.9, summary: "- Ran 5k" })),
    );
    const proposal = await router.route({ id: "d1", text: "went running this morning" }, cols);
    expect(proposal.category).toBe("area");
    expect(proposal.projectId).toBe("Areas/Health");
    const target = await router.apply(proposal);
    expect(target).toBe("Areas/Health.md");
    expect(await vault.read("Areas/Health.md")).toContain("Ran 5k");
  });

  it("auto-creates a new area note when autoCreate=auto", async () => {
    const vault = await setupVault();
    const cols = await loadCollections(vault, "Projects", "Areas");
    const router = new BrainDumpRouter(
      vault,
      stub(() => ({
        category: "new-area",
        newTitle: "Piano",
        newDescription: "Learning piano",
        confidence: 0.8,
        summary: "- Booked first lesson",
      })),
      { autoCreate: "auto" },
    );
    const proposal = await router.route({ id: "d2", text: "starting piano lessons" }, cols);
    expect(proposal.category).toBe("new-area");
    expect(proposal.newNote?.title).toBe("Piano");
    const target = await router.apply(proposal);
    expect(target).toBe("Areas/piano.md");
    const content = await vault.read("Areas/piano.md");
    expect(content).toContain("type: area");
    expect(content).toContain("## Log");
    expect(content).toContain("Booked first lesson");
  });

  it("does not create when autoCreate=off", async () => {
    const vault = await setupVault();
    const cols = await loadCollections(vault, "Projects", "Areas");
    const router = new BrainDumpRouter(
      vault,
      stub(() => ({ category: "new-project", newTitle: "X", confidence: 0.9, summary: "- y" })),
      { autoCreate: "off" },
    );
    const proposal = await router.route({ id: "d3", text: "new thing" }, cols);
    expect(await router.apply(proposal)).toBeNull();
  });

  it("includes a 'why' line when explainRouting is on (via config)", async () => {
    const vault = await setupVault();
    const cols = await loadCollections(vault, "Projects", "Areas");
    const config = resolveConfig({ explainRouting: true });
    const router = new BrainDumpRouter(
      vault,
      stub(() => ({
        category: "project",
        projectId: "Projects/Vetos",
        confidence: 0.9,
        summary: "- new mark",
        reason: "mentions the logo",
      })),
      routerOptionsFromConfig(config),
    );
    const proposal = await router.route({ id: "d4", text: "logo tweak" }, cols);
    expect(proposal.entryMarkdown).toContain("_Why: mentions the logo_");
  });
});
