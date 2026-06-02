import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core",
  "packages/memory-node",
  "packages/drive",
  "packages/mcp-server",
  "packages/cli",
]);
