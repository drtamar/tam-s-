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

  async listDir(dir: string): Promise<NotePath[]> {
    // The adapter sees raw files of any extension (Obsidian's index skips
    // unknown types like .jsonl by default).
    const out: NotePath[] = [];
    const walk = async (folder: string): Promise<void> => {
      if (!(await this.vault.adapter.exists(folder))) return;
      const listed = await this.vault.adapter.list(folder);
      out.push(...listed.files);
      for (const sub of listed.folders) await walk(sub);
    };
    await walk(normalizePath(dir));
    return out.sort();
  }

  async read(path: NotePath): Promise<string> {
    if (!path.endsWith(".md")) return this.vault.adapter.read(normalizePath(path));
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
    if (!path.endsWith(".md")) return this.vault.adapter.exists(normalizePath(path));
    return this.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile;
  }

  async write(path: NotePath, content: string): Promise<void> {
    const norm = normalizePath(path);
    if (!norm.endsWith(".md")) {
      await this.#ensureFolder(norm);
      await this.vault.adapter.write(norm, content);
      return;
    }
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
    if (!(await this.vault.adapter.exists(dir))) {
      await this.vault.adapter.mkdir(dir).catch(() => {
        /* already exists / race — ignore */
      });
    }
  }
}
