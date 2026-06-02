/** A markdown file discovered in a Drive vault, with a vault-relative path. */
export interface DriveFile {
  id: string;
  /** Vault-relative POSIX path, e.g. `Projects/Vetos.md`. */
  path: string;
  mtimeMs: number;
  /** Parent folder id (needed to create siblings on push). */
  parentId: string;
}

/**
 * Provider-agnostic Drive access used by the sync layer. The default
 * implementation ({@link GoogleDriveClient}) talks to the Google Drive API, but
 * tests and alternative backends can implement this interface directly.
 */
export interface DriveClient {
  /** Recursively list markdown files under a root folder, with relative paths. */
  listMarkdown(rootFolderId: string): Promise<DriveFile[]>;
  /** Download a file's text content. */
  download(fileId: string): Promise<string>;
  /** Ensure a folder path exists under root, returning the deepest folder id. */
  ensureFolder(rootFolderId: string, relativeDir: string): Promise<string>;
  /** Create or update a markdown file; returns its file id. */
  upload(args: {
    parentId: string;
    name: string;
    content: string;
    existingId?: string;
  }): Promise<string>;
}
