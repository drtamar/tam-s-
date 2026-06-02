import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core",
  "packages/memory-node",
  "packages/mcp-server",
  "packages/cli",
]);
