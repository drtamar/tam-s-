import { DriveSync, GoogleDriveClient } from "@osb/drive";

export interface SyncFlags {
  /** Local mirror directory. */
  local: string;
  /** Google Drive root folder id of the vault. */
  root: string;
}

/** Pull the Drive vault into the local mirror. */
export async function syncPull(flags: SyncFlags): Promise<string> {
  const sync = new DriveSync(new GoogleDriveClient(), flags.local, flags.root);
  const result = await sync.pull();
  return `Pulled ${result.pulled} file(s) into ${flags.local}.`;
}

/** Push local changes back to the Drive vault. */
export async function syncPush(flags: SyncFlags): Promise<string> {
  const sync = new DriveSync(new GoogleDriveClient(), flags.local, flags.root);
  const result = await sync.push();
  return `Pushed ${result.created} new + ${result.updated} updated file(s) to Drive.`;
}
