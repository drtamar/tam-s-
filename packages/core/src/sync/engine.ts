import type { VaultReader } from "../vault/VaultReader.js";
import type { Manifest, SyncBackend, SyncReport } from "./types.js";

export interface SyncOptions {
  /** Folders (`memory`, `Chats`) or exact files (`About Me.md`) to sync. */
  include: string[];
  /** File extensions to sync. Default: md, jsonl, json. */
  exts?: string[];
  /** Used to date conflict copies. */
  now?: Date;
}

/** cyrb53 string hash — fast, 53-bit, no dependencies. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function conflictPath(path: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? `${path.slice(0, dot)}.conflict-${day}${path.slice(dot)}` : `${path}.conflict-${day}`;
}

/**
 * Two-way sync between the vault and a remote store.
 *
 * Safe by construction: it never deletes anything on either side. When both
 * sides changed the same file, the local version wins and the remote version is
 * kept next to it as `<name>.conflict-<date>.<ext>`, so nothing is ever lost.
 * (Memory JSONL is one-file-per-device, so those never conflict.)
 */
export class SyncEngine {
  constructor(
    private readonly vault: VaultReader,
    private readonly backend: SyncBackend,
    /** Mutated in place; the caller persists it after `run()`. */
    readonly manifest: Manifest,
    private readonly opts: SyncOptions,
  ) {}

  async #localPaths(): Promise<string[]> {
    const exts = this.opts.exts ?? [".md", ".jsonl", ".json"];
    const out = new Set<string>();
    for (const inc of this.opts.include) {
      if (exts.some((e) => inc.endsWith(e))) {
        if (await this.vault.exists(inc)) out.add(inc);
      } else {
        for (const p of await this.vault.listDir(inc)) if (exts.some((e) => p.endsWith(e))) out.add(p);
      }
    }
    return [...out];
  }

  #wanted(path: string): boolean {
    const exts = this.opts.exts ?? [".md", ".jsonl", ".json"];
    return (
      exts.some((e) => path.endsWith(e)) &&
      this.opts.include.some((inc) => path === inc || path.startsWith(inc.replace(/\/?$/, "/")))
    );
  }

  async run(): Promise<SyncReport> {
    const now = this.opts.now ?? new Date();
    const report: SyncReport = { uploaded: [], downloaded: [], conflicts: [], unchanged: 0 };
    const remote = new Map((await this.backend.list()).filter((r) => this.#wanted(r.path)).map((r) => [r.path, r]));
    const paths = new Set([...(await this.#localPaths()), ...remote.keys()]);

    const upload = async (path: string, content: string, id?: string) => {
      const res = id ? await this.backend.update(id, path, content) : await this.backend.create(path, content);
      this.manifest[path] = { id: res.id, localHash: hashText(content), remoteMd5: res.md5 };
      report.uploaded.push(path);
    };
    const download = async (path: string, id: string, md5: string) => {
      const content = await this.backend.download(id);
      await this.vault.write(path, content);
      this.manifest[path] = { id, localHash: hashText(content), remoteMd5: md5 };
      report.downloaded.push(path);
    };

    for (const path of [...paths].sort()) {
      const hasLocal = await this.vault.exists(path);
      const local = hasLocal ? await this.vault.read(path) : undefined;
      const r = remote.get(path);
      const m = this.manifest[path];

      if (local !== undefined && !r) {
        await upload(path, local);
      } else if (local === undefined && r) {
        await download(path, r.id, r.md5);
      } else if (local !== undefined && r) {
        if (!m) {
          // Both sides have it and we have never synced it.
          const theirs = await this.backend.download(r.id);
          if (theirs === local) {
            this.manifest[path] = { id: r.id, localHash: hashText(local), remoteMd5: r.md5 };
            report.unchanged++;
          } else {
            await this.vault.write(conflictPath(path, now), theirs);
            report.conflicts.push(path);
            await upload(path, local, r.id);
          }
        } else {
          const localChanged = hashText(local) !== m.localHash;
          const remoteChanged = r.md5 !== m.remoteMd5;
          if (!localChanged && !remoteChanged) report.unchanged++;
          else if (localChanged && !remoteChanged) await upload(path, local, r.id);
          else if (!localChanged && remoteChanged) await download(path, r.id, r.md5);
          else {
            await this.vault.write(conflictPath(path, now), await this.backend.download(r.id));
            report.conflicts.push(path);
            await upload(path, local, r.id);
          }
        }
      }
    }
    return report;
  }
}
