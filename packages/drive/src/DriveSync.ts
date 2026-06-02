import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DriveClient } from "./DriveClient.js";

interface ManifestEntry {
  fileId: string;
  parentId: string;
  hash: string;
}
interface Manifest {
  version: 1;
  rootFolderId: string;
  files: Record<string, ManifestEntry>;
}

export interface PullResult {
  pulled: number;
  files: string[];
}
export interface PushResult {
  created: number;
  updated: number;
  files: string[];
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/**
 * Two-way sync between a Google Drive vault folder and a local directory, so the
 * engine (CLI/MCP) can operate on local files. A manifest under `.osb/` tracks
 * the Drive file id and content hash for each path, enabling change detection.
 */
export class DriveSync {
  constructor(
    private readonly client: DriveClient,
    private readonly localDir: string,
    private readonly rootFolderId: string,
  ) {}

  /** Download every markdown file from Drive into the local directory. */
  async pull(): Promise<PullResult> {
    const remote = await this.client.listMarkdown(this.rootFolderId);
    const manifest: Manifest = {
      version: 1,
      rootFolderId: this.rootFolderId,
      files: {},
    };
    const files: string[] = [];
    for (const file of remote) {
      const content = await this.client.download(file.id);
      await this.#writeLocal(file.path, content);
      manifest.files[file.path] = {
        fileId: file.id,
        parentId: file.parentId,
        hash: sha1(content),
      };
      files.push(file.path);
    }
    await this.#saveManifest(manifest);
    return { pulled: files.length, files };
  }

  /** Upload locally-changed/new markdown files back to Drive. */
  async push(): Promise<PushResult> {
    const manifest = await this.#loadManifest();
    const localPaths = await this.#listLocal();
    let created = 0;
    let updated = 0;
    const files: string[] = [];

    for (const rel of localPaths) {
      const content = await fs.readFile(path.join(this.localDir, rel), "utf8");
      const hash = sha1(content);
      const entry = manifest.files[rel];
      if (entry && entry.hash === hash) continue; // unchanged

      const dir = path.posix.dirname(rel);
      const name = path.posix.basename(rel);
      if (entry) {
        await this.client.upload({ parentId: entry.parentId, name, content, existingId: entry.fileId });
        manifest.files[rel] = { ...entry, hash };
        updated++;
      } else {
        const parentId = await this.client.ensureFolder(
          this.rootFolderId,
          dir === "." ? "" : dir,
        );
        const fileId = await this.client.upload({ parentId, name, content });
        manifest.files[rel] = { fileId, parentId, hash };
        created++;
      }
      files.push(rel);
    }
    await this.#saveManifest(manifest);
    return { created, updated, files };
  }

  async #writeLocal(rel: string, content: string): Promise<void> {
    const abs = path.join(this.localDir, rel.split("/").join(path.sep));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }

  async #listLocal(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === ".osb" || e.name === ".git") continue;
        if (e.isDirectory()) await walk(path.join(dir, e.name), `${prefix}${e.name}/`);
        else if (e.isFile() && e.name.endsWith(".md")) out.push(`${prefix}${e.name}`);
      }
    };
    await walk(this.localDir, "");
    return out;
  }

  #manifestPath(): string {
    return path.join(this.localDir, ".osb", "drive-manifest.json");
  }

  async #loadManifest(): Promise<Manifest> {
    try {
      return JSON.parse(await fs.readFile(this.#manifestPath(), "utf8")) as Manifest;
    } catch {
      return { version: 1, rootFolderId: this.rootFolderId, files: {} };
    }
  }

  async #saveManifest(manifest: Manifest): Promise<void> {
    await fs.mkdir(path.dirname(this.#manifestPath()), { recursive: true });
    await fs.writeFile(this.#manifestPath(), JSON.stringify(manifest, null, 2), "utf8");
  }
}
