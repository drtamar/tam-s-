// Mobile-safe vault surface: the interface + types only. The Node-backed
// `NodeVaultReader` (chokidar) is intentionally NOT re-exported here so the
// Obsidian bundle can implement `VaultReader` without pulling in Node deps.
export type {
  Disposable,
  NoteId,
  NotePath,
  VaultChangeEvent,
  VaultFile,
} from "./types.js";
export type { VaultReader } from "./VaultReader.js";
