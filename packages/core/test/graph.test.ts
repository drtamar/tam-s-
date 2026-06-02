import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import { loadVault, type LoadedVault } from "../src/loadVault.js";
import { findOrphans, shortestPath } from "../src/graph/queries.js";
import { getBacklinks } from "../src/graph/backlinks.js";
import { proposeBrokenLinks } from "../src/optimize/brokenLinks.js";

const vaultDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "sample-vault",
);

describe("knowledge graph", () => {
  let loaded: LoadedVault;

  beforeAll(async () => {
    loaded = await loadVault(new NodeVaultReader(vaultDir));
  });

  it("discovers every markdown file including nested folders", () => {
    expect(loaded.notes.map((n) => n.id).sort()).toEqual([
      "Knowledge Graph",
      "Orphan",
      "Welcome",
      "notes/Memory",
    ]);
  });

  it("resolves wikilinks by basename across folders", () => {
    expect(getBacklinks(loaded.graph, "Knowledge Graph").map((b) => b.from).sort()).toEqual([
      "Welcome",
      "notes/Memory",
    ]);
  });

  it("collects broken links", () => {
    expect(loaded.brokenLinks).toContainEqual({
      from: "Knowledge Graph",
      target: "Missing Note",
    });
    expect(proposeBrokenLinks(loaded.brokenLinks)[0]?.suggestion).toBe("create-note");
  });

  it("finds orphan notes", () => {
    expect(findOrphans(loaded.graph)).toEqual(["Orphan"]);
  });

  it("computes shortest paths", () => {
    // Welcome links directly to Memory, so the path is a single hop.
    expect(shortestPath(loaded.graph, "Welcome", "notes/Memory")).toEqual([
      "Welcome",
      "notes/Memory",
    ]);
  });

  it("creates tag nodes for nested tags", () => {
    expect(loaded.graph.nodes.has("#project/alpha")).toBe(true);
  });
});
