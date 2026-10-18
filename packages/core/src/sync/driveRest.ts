import type { Http, HttpResponse } from "../mem/providers.js";
import type { RemoteFile, SyncBackend } from "./types.js";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,md5Checksum,modifiedTime";

export interface TokenSource {
  accessToken(): Promise<string>;
}

/**
 * {@link SyncBackend} over the Drive v3 REST API (plain HTTP, so it runs inside
 * Obsidian on Android). Uses the `drive.file` scope: it can only see files this
 * app created, inside one folder (`rootName`) it creates in My Drive.
 */
export class DriveRestBackend implements SyncBackend {
  #root: string | undefined;
  readonly #folders = new Map<string, string>(); // "a/b" -> folderId

  constructor(
    private readonly http: Http,
    private readonly auth: TokenSource,
    private readonly rootName = "Second Brain",
  ) {}

  async #call(method: "GET" | "POST" | "PATCH", url: string, headers: Record<string, string> = {}, body?: string): Promise<HttpResponse> {
    const res = await this.http({
      url,
      method,
      headers: { authorization: `Bearer ${await this.auth.accessToken()}`, ...headers },
      body,
    });
    if (res.status < 200 || res.status >= 300) {
      let msg = res.text.slice(0, 200);
      try {
        msg = JSON.parse(res.text).error?.message ?? msg;
      } catch {
        /* keep raw */
      }
      throw new Error(`Drive ${res.status}: ${msg}`);
    }
    return res;
  }

  async #json<T>(method: "GET" | "POST" | "PATCH", url: string, headers?: Record<string, string>, body?: string): Promise<T> {
    return JSON.parse((await this.#call(method, url, headers, body)).text) as T;
  }

  async #rootId(): Promise<string> {
    if (this.#root) return this.#root;
    const q = encodeURIComponent(`name='${this.rootName}' and mimeType='${FOLDER}' and 'root' in parents and trashed=false`);
    const found = await this.#json<{ files: { id: string }[] }>("GET", `${API}/files?q=${q}&fields=files(id)`);
    if (found.files[0]) return (this.#root = found.files[0].id);
    const made = await this.#json<{ id: string }>(
      "POST", `${API}/files?fields=id`, { "content-type": "application/json" },
      JSON.stringify({ name: this.rootName, mimeType: FOLDER }),
    );
    return (this.#root = made.id);
  }

  async #children(parent: string) {
    const out: { id: string; name: string; mimeType?: string; md5Checksum?: string; modifiedTime?: string }[] = [];
    let token = "";
    do {
      const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
      const page = await this.#json<{ files: typeof out; nextPageToken?: string }>(
        "GET",
        `${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime)${token ? `&pageToken=${token}` : ""}`,
      );
      out.push(...page.files);
      token = page.nextPageToken ?? "";
    } while (token);
    return out;
  }

  async list(): Promise<RemoteFile[]> {
    const root = await this.#rootId();
    const out: RemoteFile[] = [];
    const walk = async (id: string, prefix: string): Promise<void> => {
      for (const f of await this.#children(id)) {
        if (f.mimeType === FOLDER) {
          this.#folders.set(`${prefix}${f.name}`, f.id);
          await walk(f.id, `${prefix}${f.name}/`);
        } else {
          out.push({ id: f.id, path: `${prefix}${f.name}`, md5: f.md5Checksum ?? "", modified: f.modifiedTime ?? "" });
        }
      }
    };
    await walk(root, "");
    return out;
  }

  async download(id: string): Promise<string> {
    return (await this.#call("GET", `${API}/files/${id}?alt=media`)).text;
  }

  async #ensureFolder(dir: string): Promise<string> {
    let parent = await this.#rootId();
    let acc = "";
    for (const seg of dir.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      let id = this.#folders.get(acc);
      if (!id) {
        const made = await this.#json<{ id: string }>(
          "POST", `${API}/files?fields=id`, { "content-type": "application/json" },
          JSON.stringify({ name: seg, mimeType: FOLDER, parents: [parent] }),
        );
        id = made.id;
        this.#folders.set(acc, id);
      }
      parent = id;
    }
    return parent;
  }

  async create(path: string, content: string): Promise<RemoteFile> {
    const slash = path.lastIndexOf("/");
    const parent = await this.#ensureFolder(slash < 0 ? "" : path.slice(0, slash));
    const name = path.slice(slash + 1);
    const boundary = "osb" + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [parent] }) +
      `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const f = await this.#json<{ id: string; md5Checksum?: string; modifiedTime?: string }>(
      "POST", `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`,
      { "content-type": `multipart/related; boundary=${boundary}` }, body,
    );
    return { id: f.id, path, md5: f.md5Checksum ?? "", modified: f.modifiedTime ?? "" };
  }

  async update(id: string, path: string, content: string): Promise<RemoteFile> {
    const f = await this.#json<{ id: string; md5Checksum?: string; modifiedTime?: string }>(
      "PATCH", `${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`,
      { "content-type": "text/plain; charset=UTF-8" }, content,
    );
    return { id: f.id, path, md5: f.md5Checksum ?? "", modified: f.modifiedTime ?? "" };
  }
}
