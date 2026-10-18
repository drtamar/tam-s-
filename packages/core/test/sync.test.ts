import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeVaultReader } from "../src/vault/NodeVaultReader.js";
import {
  DriveRestBackend,
  GoogleSession,
  SyncEngine,
  hashText,
  pollDeviceLogin,
  startDeviceLogin,
  type Manifest,
  type RemoteFile,
  type SyncBackend,
} from "../src/sync/index.js";
import type { Http } from "../src/mem/providers.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
const mkVault = async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "osb-sync-"));
  dirs.push(d);
  return new NodeVaultReader(d);
};

/** In-memory "Drive": md5 is a hash of content, so changes are detectable. */
class FakeDrive implements SyncBackend {
  files = new Map<string, { path: string; content: string }>();
  n = 0;
  async list(): Promise<RemoteFile[]> {
    return [...this.files].map(([id, f]) => ({ id, path: f.path, md5: hashText(f.content), modified: "" }));
  }
  async download(id: string) { return this.files.get(id)!.content; }
  async create(p: string, content: string) {
    const id = `f${this.n++}`;
    this.files.set(id, { path: p, content });
    return { id, path: p, md5: hashText(content), modified: "" };
  }
  async update(id: string, p: string, content: string) {
    this.files.set(id, { path: p, content });
    return { id, path: p, md5: hashText(content), modified: "" };
  }
}

const opts = { include: ["memory", "Chats", "About Me.md"], now: new Date("2026-10-18") };

describe("SyncEngine", () => {
  it("syncs phone -> drive -> pc, then edits flow both ways", async () => {
    const drive = new FakeDrive();
    const phone = await mkVault();
    const pc = await mkVault();
    const phoneM: Manifest = {};
    const pcM: Manifest = {};

    await phone.write("memory/phone.jsonl", '{"id":"p1"}\n');
    await phone.write("About Me.md", "# About Me\n");
    await phone.write("Secret/private.md", "never synced");

    let r = await new SyncEngine(phone, drive, phoneM, opts).run();
    expect(r.uploaded.sort()).toEqual(["About Me.md", "memory/phone.jsonl"]);
    expect([...drive.files.values()].some((f) => f.path.startsWith("Secret"))).toBe(false);

    r = await new SyncEngine(pc, drive, pcM, opts).run();
    expect(r.downloaded.sort()).toEqual(["About Me.md", "memory/phone.jsonl"]);
    expect(await pc.read("memory/phone.jsonl")).toBe('{"id":"p1"}\n');

    // PC adds its own device file; phone edits About Me.
    await pc.write("memory/pc.jsonl", '{"id":"c1"}\n');
    await phone.write("About Me.md", "# About Me\nupdated\n");
    await new SyncEngine(pc, drive, pcM, opts).run();
    r = await new SyncEngine(phone, drive, phoneM, opts).run();
    expect(r.downloaded).toEqual(["memory/pc.jsonl"]);
    r = await new SyncEngine(pc, drive, pcM, opts).run();
    expect(await pc.read("About Me.md")).toContain("updated");

    // Nothing changed -> nothing transferred.
    r = await new SyncEngine(pc, drive, pcM, opts).run();
    expect(r.uploaded.length + r.downloaded.length + r.conflicts.length).toBe(0);
  });

  it("never loses data when both sides edit the same file", async () => {
    const drive = new FakeDrive();
    const a = await mkVault();
    const b = await mkVault();
    const am: Manifest = {};
    const bm: Manifest = {};
    await a.write("About Me.md", "v1");
    await new SyncEngine(a, drive, am, opts).run();
    await new SyncEngine(b, drive, bm, opts).run();

    await a.write("About Me.md", "edit from A");
    await b.write("About Me.md", "edit from B");
    await new SyncEngine(a, drive, am, opts).run();
    const r = await new SyncEngine(b, drive, bm, opts).run();

    expect(r.conflicts).toEqual(["About Me.md"]);
    expect(await b.read("About Me.md")).toBe("edit from B"); // local wins
    expect(await b.read("About Me.conflict-2026-10-18.md")).toBe("edit from A"); // remote kept
    expect([...drive.files.values()].find((f) => f.path === "About Me.md")!.content).toBe("edit from B");
  });

  it("does not delete anything when a file disappears locally", async () => {
    const drive = new FakeDrive();
    const a = await mkVault();
    const am: Manifest = {};
    await a.write("About Me.md", "keep me");
    await new SyncEngine(a, drive, am, opts).run();
    await fs.rm(path.join((a as any).root, "About Me.md"));
    await new SyncEngine(a, drive, am, opts).run();
    expect(await a.read("About Me.md")).toBe("keep me"); // restored from Drive
    expect(drive.files.size).toBe(1);
  });
});

describe("DriveRestBackend", () => {
  it("creates its root folder, nested folders, and multipart files", async () => {
    const calls: { method: string; url: string; body?: string; ct?: string }[] = [];
    const http: Http = async (req) => {
      calls.push({ method: req.method ?? "POST", url: req.url, body: req.body, ct: req.headers["content-type"] });
      if (req.method === "GET") return { status: 200, text: JSON.stringify({ files: [] }) };
      if (req.url.includes("uploadType=multipart"))
        return { status: 200, text: JSON.stringify({ id: "file1", md5Checksum: "abc" }) };
      return { status: 200, text: JSON.stringify({ id: `folder${calls.length}` }) };
    };
    const drive = new DriveRestBackend(http, { accessToken: async () => "tok" });
    const f = await drive.create("memory/phone.jsonl", '{"a":1}\n');
    expect(f).toMatchObject({ id: "file1", md5: "abc", path: "memory/phone.jsonl" });

    const folderCreates = calls.filter((c) => c.method === "POST" && c.body?.includes("google-apps.folder"));
    expect(folderCreates.length).toBe(2); // "Second Brain" root + "memory"
    const upload = calls.find((c) => c.url.includes("uploadType=multipart"))!;
    expect(upload.ct).toMatch(/^multipart\/related; boundary=/);
    expect(upload.body).toContain('"name":"phone.jsonl"');
    expect(upload.body).toContain('{"a":1}');
  });

  it("walks the folder tree into vault-relative paths", async () => {
    const tree: Record<string, any[]> = {
      root1: [{ id: "d1", name: "Chats", mimeType: "application/vnd.google-apps.folder" }, { id: "x", name: "About Me.md", md5Checksum: "m1" }],
      d1: [{ id: "y", name: "a.md", md5Checksum: "m2" }],
    };
    const http: Http = async (req) => {
      if (req.url.includes("name%3D")) return { status: 200, text: JSON.stringify({ files: [{ id: "root1" }] }) };
      const parent = decodeURIComponent(req.url).match(/'([^']+)' in parents/)![1]!;
      return { status: 200, text: JSON.stringify({ files: tree[parent] ?? [] }) };
    };
    const list = await new DriveRestBackend(http, { accessToken: async () => "t" }).list();
    expect(list.map((f) => f.path).sort()).toEqual(["About Me.md", "Chats/a.md"]);
  });

  it("reports Drive errors readably", async () => {
    const http: Http = async () => ({ status: 403, text: JSON.stringify({ error: { message: "insufficientPermissions" } }) });
    await expect(new DriveRestBackend(http, { accessToken: async () => "t" }).list()).rejects.toThrow("Drive 403: insufficientPermissions");
  });
});

describe("Google device sign-in", () => {
  const client = { clientId: "cid", clientSecret: "sec" };
  it("polls through pending/slow_down until approved", async () => {
    const answers = [{ error: "authorization_pending" }, { error: "slow_down" }, { access_token: "A", refresh_token: "R", expires_in: 3600 }];
    const sleeps: number[] = [];
    const http: Http = async (req) => {
      if (req.url.includes("device/code"))
        return { status: 200, text: JSON.stringify({ device_code: "dc", user_code: "ABCD-EFGH", verification_url: "https://www.google.com/device", interval: 5, expires_in: 600 }) };
      return { status: 200, text: JSON.stringify(answers.shift()) };
    };
    const code = await startDeviceLogin(http, client);
    expect(code.userCode).toBe("ABCD-EFGH");
    const tokens = await pollDeviceLogin(http, client, code, async (ms) => { sleeps.push(ms); }, () => 0);
    expect(tokens).toMatchObject({ accessToken: "A", refreshToken: "R" });
    expect(sleeps).toEqual([5000, 5000, 10000]); // slow_down backs off
  });

  it("stops on denial", async () => {
    const http: Http = async () => ({ status: 400, text: JSON.stringify({ error: "access_denied" }) });
    await expect(
      pollDeviceLogin(http, client, { deviceCode: "d", userCode: "u", verificationUrl: "v", interval: 1, expiresIn: 60 }, async () => {}, () => 0),
    ).rejects.toThrow("access_denied");
  });

  it("refreshes an expired access token and persists it", async () => {
    let saved: any;
    const http: Http = async () => ({ status: 200, text: JSON.stringify({ access_token: "NEW", expires_in: 3600 }) });
    const s = new GoogleSession(http, client, { refreshToken: "R", accessToken: "OLD", expiresAt: 1000 }, (t) => { saved = t; }, () => 5_000_000);
    expect(await s.accessToken()).toBe("NEW");
    expect(saved.refreshToken).toBe("R");
  });
});
