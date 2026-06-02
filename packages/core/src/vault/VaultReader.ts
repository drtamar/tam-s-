import type {
  Disposable,
  NotePath,
  VaultChangeEvent,
  VaultFile,
} from "./types.js";

/**
 * The single abstraction the whole system hinges on.
 *
 * The engine in `@osb/core` never touches the filesystem directly. Instead it
 * talks to a `VaultReader`, which is implemented differently per environment:
 *
 * - `NodeVaultReader` (this package) uses `fs` + `chokidar` for the CLI, MCP
 *   server, and web app.
 * - `ObsidianVaultReader` (the plugin package) wraps the Obsidian `Vault` API.
 *
 * Same parsing / graph / memory code, two backends.
 */
export interface VaultReader {
  /** List every markdown file in the vault, as vault-relative paths. */
  list(): Promise<NotePath[]>;

  /** Read a single file's raw contents. */
  read(path: NotePath): Promise<string>;

  /** Read a file together with its metadata (mtime), when available. */
  readFile(path: NotePath): Promise<VaultFile>;

  /** Create or overwrite a file. Parent folders are created as needed. */
  write(path: NotePath, content: string): Promise<void>;

  /** Whether a file exists. */
  exists(path: NotePath): Promise<boolean>;

  /** Optionally watch for changes. Returns a disposable to stop watching. */
  watch?(onChange: (event: VaultChangeEvent) => void): Disposable;
}
