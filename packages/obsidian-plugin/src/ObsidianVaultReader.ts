import { TFile, normalizePath, type Vault } from "obsidian";
import type {
  NotePath,
  VaultFile,
  VaultReader,
} from "@osb/core/vault";

/**
 * {@link VaultReader} backed by the Obsidian `Vault` API — the same engine
 * (`@osb/core`) the CLI and MCP server use, but reading/writing through Obsidian
 * so it works identically on desktop and mobile.
 */
export class ObsidianVaultReader implements VaultReader {
  constructor(private readonly vault: Vault) {}

  async list(): Promise<NotePath[]> {
    return this.vault.getMarkdownFiles().map((f) => f.path);
  }

  async read(path: NotePath): Promise<string> {
    const file = this.#file(path);
    return this.vault.cachedRead(file);
  }

  async readFile(path: NotePath): Promise<VaultFile> {
    const file = this.#file(path);
    return {
      path: file.path,
      content: await this.vault.cachedRead(file),
      mtimeMs: file.stat.mtime,
    };
  }

  async exists(path: NotePath): Promise<boolean> {
    return this.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile;
  }

  async write(path: NotePath, content: string): Promise<void> {
    const norm = normalizePath(path);
    const existing = this.vault.getAbstractFileByPath(norm);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
      return;
    }
    await this.#ensureFolder(norm);
    await this.vault.create(norm, content);
  }

  #file(path: NotePath): TFile {
    const file = this.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
    return file;
  }

  async #ensureFolder(path: NotePath): Promise<void> {
    const dir = path.split("/").slice(0, -1).join("/");
    if (!dir) return;
    if (!this.vault.getAbstractFileByPath(dir)) {
      await this.vault.createFolder(dir).catch(() => {
        /* already exists / race — ignore */
      });
    }
  }
}
