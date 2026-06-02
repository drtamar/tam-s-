import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import { loadProjects } from "../src/projects/loadProjects.js";
import { BrainDumpRouter } from "../src/projects/router.js";
import { appendUnderHeading } from "../src/util/markdown.js";
import type { LlmClient } from "../src/projects/types.js";

describe("appendUnderHeading", () => {
  it("creates the section when missing", () => {
    const out = appendUnderHeading("# Note\n\nbody", "## Log", "### 2026-06-02\n\n- did a thing");
    expect(out).toContain("## Log");
    expect(out.trim().endsWith("- did a thing")).toBe(true);
  });

  it("inserts under an existing section above later headings", () => {
    const doc = "# Note\n\n## Log\n\n- old\n\n## Other\n\nx";
    const out = appendUnderHeading(doc, "## Log", "- new");
    expect(out.indexOf("- new")).toBeGreaterThan(out.indexOf("- old"));
    expect(out.indexOf("- new")).toBeLessThan(out.indexOf("## Other"));
  });
});

/** Stub LLM: routes anything mentioning "logo" to Vetos, else about-me. */
class StubLlm implements LlmClient {
  readonly model = "stub";
  async complete({ prompt }: { prompt: string }): Promise<string> {
    if (/logo|brand/i.test(prompt)) {
      return JSON.stringify({
        category: "project",
        projectId: "Projects/Vetos",
        confidence: 0.9,
        summary: "- Logo idea captured",
      });
    }
    return JSON.stringify({
      category: "about-me",
      projectId: null,
      confidence: 0.8,
      summary: "- Personal note",
    });
  }
}

describe("BrainDumpRouter", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  async function setupVault(): Promise<NodeVaultReader> {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-proj-"));
    await fs.mkdir(path.join(dir, "Projects"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "Projects", "Vetos.md"),
      "# Vetos\n\nBranding, logo, alien planet style. Main focus.\n",
    );
    await fs.writeFile(
      path.join(dir, "Projects", "Income Project.md"),
      "# Income Project\n\nPassive income > $1000/month.\n",
    );
    return new NodeVaultReader(dir);
  }

  it("loads project profiles from the Projects folder", async () => {
    const vault = await setupVault();
    const projects = await loadProjects(vault, "Projects");
    expect(projects.map((p) => p.title).sort()).toEqual(["Income Project", "Vetos"]);
    expect(projects.find((p) => p.title === "Vetos")?.description).toContain("logo");
  });

  it("routes a project dump and appends a dated entry under ## Log", async () => {
    const vault = await setupVault();
    const projects = await loadProjects(vault, "Projects");
    const router = new BrainDumpRouter(vault, new StubLlm());

    const proposal = await router.route(
      { id: "daily-1", text: "new logo concept for the brand", source: "2026-06-02" },
      projects,
    );
    expect(proposal.category).toBe("project");
    expect(proposal.projectId).toBe("Projects/Vetos");
    expect(proposal.entryMarkdown).toContain("Source: [[2026-06-02]]");

    const written = await router.apply(proposal);
    expect(written).toBe("Projects/Vetos.md");
    const content = await vault.read("Projects/Vetos.md");
    expect(content).toContain("## Log");
    expect(content).toContain("Logo idea captured");
  });

  it("rejects hallucinated project ids", async () => {
    const vault = await setupVault();
    const router = new BrainDumpRouter(vault, {
      model: "x",
      async complete() {
        return JSON.stringify({ category: "project", projectId: "Projects/DoesNotExist", confidence: 0.99, summary: "- x" });
      },
    });
    const projects = await loadProjects(vault, "Projects");
    const proposal = await router.route({ id: "d", text: "anything" }, projects);
    expect(proposal.projectId).toBeNull();
    expect(proposal.category).toBe("unknown");
  });
});
