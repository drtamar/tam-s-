import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { graphStats } from "../src/commands/graph.js";
import { optimizeVault } from "../src/commands/optimize.js";

const vaultDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "sample-vault",
);

describe("graph command", () => {
  it("reports stats for the sample vault", async () => {
    const stats = await graphStats(vaultDir);
    expect(stats.notes).toBe(4);
    expect(stats.orphans).toBe(1);
    expect(stats.brokenLinks).toBe(1);
  });
});

describe("optimize command", () => {
  it("reports orphans and broken links", async () => {
    const report = await optimizeVault(vaultDir);
    expect(report.orphans.map((o) => o.noteId)).toEqual(["Orphan"]);
    expect(report.brokenLinks[0]?.target).toBe("Missing Note");
  });
});
