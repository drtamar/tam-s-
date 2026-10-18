/** A file in the remote (Drive) tree, addressed by vault-relative path. */
export interface RemoteFile {
  id: string;
  /** Vault-relative POSIX path, e.g. `memory/phone.jsonl`. */
  path: string;
  /** Content checksum reported by the remote; changes when content changes. */
  md5: string;
  modified: string;
}

/** What the sync engine needs from a remote store. Drive implements it; tests fake it. */
export interface SyncBackend {
  /** Every file under the remote root, with vault-relative paths. */
  list(): Promise<RemoteFile[]>;
  download(id: string): Promise<string>;
  /** Create a file (and any missing parent folders). */
  create(path: string, content: string): Promise<RemoteFile>;
  update(id: string, path: string, content: string): Promise<RemoteFile>;
}

export interface ManifestEntry {
  id: string;
  /** Hash of the local content at last sync. */
  localHash: string;
  /** Remote checksum at last sync. */
  remoteMd5: string;
}
export type Manifest = Record<string, ManifestEntry>;

export interface SyncReport {
  uploaded: string[];
  downloaded: string[];
  conflicts: string[];
  unchanged: number;
}
