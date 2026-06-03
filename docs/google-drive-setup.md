# Connecting your Google Drive vault (service-account sync)

This lets the CLI/MCP server work on a **local mirror** of a vault that lives in
Google Drive, and push changes back. The Obsidian plugin does **not** need this —
it edits the vault directly and your existing Obsidian/Drive sync handles the rest.

## 1. Create a service account

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create
   (or pick) a project.
2. **APIs & Services → Library →** enable the **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Give it a name and create it. You don't need to grant project roles.
4. Open the service account → **Keys → Add key → Create new key → JSON.**
   Download the JSON file and keep it private.

## 2. Share the vault folder with the service account

The service account has its own email like
`osb-sync@your-project.iam.gserviceaccount.com`. In Google Drive, **share your
vault folder** with that email (Viewer to read; **Editor** if you want
`sync push` to write back).

## 3. Find the folder id

Open the vault folder in Drive; the URL looks like
`https://drive.google.com/drive/folders/**<FOLDER_ID>**`. Copy `<FOLDER_ID>`.

## 4. Configure and sync

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Pull the Drive vault into a local mirror
node packages/cli/dist/index.js sync pull --root <FOLDER_ID> --local ./vault

# Organize / route / build context against ./vault
node packages/cli/dist/index.js -v ./vault organize --apply

# Push local changes back to Drive
node packages/cli/dist/index.js sync push --root <FOLDER_ID> --local ./vault
```

You can also store `rootFolderId` and `serviceAccountPath` under `drive` in
`./vault/.osb/config.json` so you don't have to repeat the flags.

> `googleapis` is an optional dependency, loaded only when you sync. A manifest
> at `./vault/.osb/drive-manifest.json` maps local paths to Drive file ids and
> detects what changed.
