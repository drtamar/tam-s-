import { createRequire } from "node:module";
import type { DriveClient, DriveFile } from "./DriveClient.js";

const require = createRequire(import.meta.url);

const FOLDER_MIME = "application/vnd.google-apps.folder";
const GDOC_MIME = "application/vnd.google-apps.document";
const MARKDOWN_MIMES = new Set(["text/markdown", "text/plain"]);

/* Minimal structural types over the bits of googleapis we use. */
interface DriveApi {
  files: {
    list(params: unknown): Promise<{ data: { files?: RawFile[]; nextPageToken?: string } }>;
    get(params: unknown, opts?: unknown): Promise<{ data: unknown }>;
    create(params: unknown): Promise<{ data: { id?: string } }>;
    update(params: unknown): Promise<{ data: { id?: string } }>;
  };
}
interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface GoogleDriveClientOptions {
  /** OAuth/service-account scopes. Default: full Drive. */
  scopes?: string[];
}

/**
 * Google Drive implementation of {@link DriveClient}. Authenticates via
 * Application Default Credentials — set `GOOGLE_APPLICATION_CREDENTIALS` to a
 * service-account JSON (the account must have access to the vault folder).
 *
 * `googleapis` is an optional dependency, loaded lazily.
 */
export class GoogleDriveClient implements DriveClient {
  #drive: DriveApi | undefined;
  readonly #scopes: string[];

  constructor(options: GoogleDriveClientOptions = {}) {
    this.#scopes = options.scopes ?? ["https://www.googleapis.com/auth/drive"];
  }

  #api(): DriveApi {
    if (!this.#drive) {
      let google: { auth: { GoogleAuth: new (o: unknown) => unknown }; drive: (o: unknown) => DriveApi };
      try {
        google = require("googleapis").google;
      } catch {
        throw new Error(
          "GoogleDriveClient requires the optional dependency 'googleapis'. Install it with `pnpm add googleapis`.",
        );
      }
      const auth = new google.auth.GoogleAuth({ scopes: this.#scopes });
      this.#drive = google.drive({ version: "v3", auth });
    }
    return this.#drive;
  }

  async listMarkdown(rootFolderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    const walk = async (folderId: string, prefix: string): Promise<void> => {
      for (const f of await this.#children(folderId)) {
        if (f.mimeType === FOLDER_MIME) {
          await walk(f.id, `${prefix}${f.name}/`);
        } else if (MARKDOWN_MIMES.has(f.mimeType) || GDOC_MIME === f.mimeType) {
          const name = f.name.endsWith(".md") ? f.name : `${f.name}.md`;
          out.push({
            id: f.id,
            path: `${prefix}${name}`,
            mtimeMs: f.modifiedTime ? Date.parse(f.modifiedTime) : 0,
            parentId: folderId,
          });
        }
      }
    };
    await walk(rootFolderId, "");
    return out;
  }

  async #children(folderId: string): Promise<RawFile[]> {
    const files: RawFile[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.#api().files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, parents)",
        pageSize: 1000,
        pageToken,
      });
      files.push(...(res.data.files ?? []));
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return files;
  }

  async download(fileId: string): Promise<string> {
    // Try a media download first (regular files); fall back to Google Doc export.
    try {
      const res = await this.#api().files.get(
        { fileId, alt: "media" },
        { responseType: "text" },
      );
      return String(res.data);
    } catch {
      const res = await this.#api().files.get(
        { fileId, alt: "media" },
        { responseType: "text" },
      );
      void res;
      const exported = await this.#api().files.get(
        { fileId, mimeType: "text/markdown" } as unknown,
        { responseType: "text" },
      );
      return String((exported as { data: unknown }).data);
    }
  }

  async ensureFolder(rootFolderId: string, relativeDir: string): Promise<string> {
    let parent = rootFolderId;
    for (const segment of relativeDir.split("/").filter(Boolean)) {
      const existing = (await this.#children(parent)).find(
        (f) => f.mimeType === FOLDER_MIME && f.name === segment,
      );
      if (existing) {
        parent = existing.id;
      } else {
        const res = await this.#api().files.create({
          requestBody: { name: segment, mimeType: FOLDER_MIME, parents: [parent] },
          fields: "id",
        });
        parent = res.data.id ?? parent;
      }
    }
    return parent;
  }

  async upload(args: {
    parentId: string;
    name: string;
    content: string;
    existingId?: string;
  }): Promise<string> {
    const media = { mimeType: "text/markdown", body: args.content };
    if (args.existingId) {
      const res = await this.#api().files.update({
        fileId: args.existingId,
        media,
        fields: "id",
      });
      return res.data.id ?? args.existingId;
    }
    const res = await this.#api().files.create({
      requestBody: { name: args.name, parents: [args.parentId] },
      media,
      fields: "id",
    });
    return res.data.id ?? "";
  }
}
