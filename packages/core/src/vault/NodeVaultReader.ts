import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import type { VaultReader } from "./VaultReader.js";
import type {
  Disposable,
  NotePath,
  VaultChangeEvent,
  VaultFile,
} from "./types.js";

const MARKDOWN_EXT = ".md";

/** Folders that should never be treated as note content. */
const IGNORED_DIRS = new Set([".git", ".obsidian", ".osb", "node_modules"]);

/**
 * Filesystem-backed {@link VaultReader} used by the CLI, MCP server, and web app.
 *
 * All paths in the public API are vault-relative and POSIX-style, regardless of
 * the host OS, so that note ids are stable and portable.
 */
export class NodeVaultReader implements VaultReader {
  constructor(private readonly root: string) {}

  async list(): Promise<NotePath[]> {
    const out: NotePath[] = [];
    await this.#walk(this.root, out);
    out.sort();
    return out;
  }

  async read(notePath: NotePath): Promise<string> {
    return fs.readFile(this.#abs(notePath), "utf8");
  }

  async readFile(notePath: NotePath): Promise<VaultFile> {
    const abs = this.#abs(notePath);
    const [content, stat] = await Promise.all([
      fs.readFile(abs, "utf8"),
      fs.stat(abs),
    ]);
    return { path: notePath, content, mtimeMs: stat.mtimeMs };
  }

  async write(notePath: NotePath, content: string): Promise<void> {
    const abs = this.#abs(notePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }

  async exists(notePath: NotePath): Promise<boolean> {
    try {
      await fs.access(this.#abs(notePath));
      return true;
    } catch {
      return false;
    }
  }

  watch(onChange: (event: VaultChangeEvent) => void): Disposable {
    const watcher = chokidar.watch(this.root, {
      ignored: (p) =>
        p
          .split(path.sep)
          .some((segment) => IGNORED_DIRS.has(segment)),
      ignoreInitial: true,
    });
    const emit = (type: VaultChangeEvent["type"]) => (abs: string) => {
      if (abs.endsWith(MARKDOWN_EXT)) {
        onChange({ type, path: this.#rel(abs) });
      }
    };
    watcher.on("add", emit("add"));
    watcher.on("change", emit("change"));
    watcher.on("unlink", emit("unlink"));
    return { dispose: () => void watcher.close() };
  }

  #abs(notePath: NotePath): string {
    return path.join(this.root, notePath.split("/").join(path.sep));
  }

  #rel(abs: string): NotePath {
    return path.relative(this.root, abs).split(path.sep).join("/");
  }

  async #walk(dir: string, out: NotePath[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await this.#walk(path.join(dir, entry.name), out);
      } else if (entry.isFile() && entry.name.endsWith(MARKDOWN_EXT)) {
        out.push(this.#rel(path.join(dir, entry.name)));
      }
    }
  }
}
