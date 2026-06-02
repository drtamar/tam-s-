import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DriveClient, DriveFile } from "../src/DriveClient.js";
import { DriveSync } from "../src/DriveSync.js";

/** In-memory DriveClient so sync logic can be tested without Google. */
class FakeDrive implements DriveClient {
  files = new Map<string, { path: string; content: string; parentId: string }>();
  folders = new Map<string, string>(); // "parent/name" -> folderId
  #seq = 0;

  seed(path: string, content: string, parentId = "root"): string {
    const id = `f${this.#seq++}`;
    this.files.set(id, { path, content, parentId });
    return id;
  }
  async listMarkdown(): Promise<DriveFile[]> {
    return [...this.files.entries()].map(([id, f]) => ({
      id,
      path: f.path,
      parentId: f.parentId,
      mtimeMs: 0,
    }));
  }
  async download(fileId: string): Promise<string> {
    return this.files.get(fileId)?.content ?? "";
  }
  async ensureFolder(rootFolderId: string, relativeDir: string): Promise<string> {
    let parent = rootFolderId;
    for (const seg of relativeDir.split("/").filter(Boolean)) {
      const key = `${parent}/${seg}`;
      if (!this.folders.has(key)) this.folders.set(key, `dir${this.#seq++}`);
      parent = this.folders.get(key) as string;
    }
    return parent;
  }
  async upload(args: { parentId: string; name: string; content: string; existingId?: string }): Promise<string> {
    if (args.existingId) {
      const f = this.files.get(args.existingId);
      if (f) f.content = args.content;
      return args.existingId;
    }
    return this.seed(args.name, args.content, args.parentId);
  }
}

let dir: string;
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe("DriveSync", () => {
  it("pulls files to local and pushes local changes back", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "osb-drive-"));
    const drive = new FakeDrive();
    const vetosId = drive.seed("Projects/Vetos.md", "# Vetos\n", "pdir");
    drive.seed("About Me.md", "# About Me\n", "root");

    const sync = new DriveSync(drive, dir, "root");
    const pull = await sync.pull();
    expect(pull.pulled).toBe(2);
    expect(await fs.readFile(path.join(dir, "Projects/Vetos.md"), "utf8")).toBe("# Vetos\n");

    // Unchanged push is a no-op.
    expect((await sync.push()).files).toEqual([]);

    // Edit locally + add a new file, then push.
    await fs.writeFile(path.join(dir, "Projects/Vetos.md"), "# Vetos\n\n## Log\n\n- new\n");
    await fs.writeFile(path.join(dir, "New.md"), "# New\n");
    const push = await sync.push();
    expect(push.updated).toBe(1);
    expect(push.created).toBe(1);
    expect(drive.files.get(vetosId)?.content).toContain("- new");
  });
});
