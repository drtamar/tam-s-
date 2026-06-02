/**
 * Core vault value types shared across every surface (CLI, MCP, plugin, web).
 */

/** A vault-relative POSIX path to a markdown file, e.g. `folder/Note.md`. */
export type NotePath = string;

/** A stable identifier for a note. By convention, the path without its `.md` extension. */
export type NoteId = string;

/** A raw markdown file as read from a {@link VaultReader}. */
export interface VaultFile {
  /** Vault-relative path, e.g. `folder/Note.md`. */
  path: NotePath;
  /** Raw file contents. */
  content: string;
  /** Last-modified time in epoch milliseconds, if the backend can provide it. */
  mtimeMs?: number;
}

/** A filesystem-style change event emitted by {@link VaultReader.watch}. */
export interface VaultChangeEvent {
  type: "add" | "change" | "unlink";
  path: NotePath;
}

/** Something that can be disposed, returned by {@link VaultReader.watch}. */
export interface Disposable {
  dispose(): void;
}
