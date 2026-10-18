# Setup: Second Brain in Obsidian (desktop + Android)

One shared memory for Claude, ChatGPT, Gemini and Grok, synced between your phone and PC through Google Drive.

## 1. Install the plugin

```bash
pnpm install && pnpm --filter @osb/obsidian-plugin build
```

Copy `packages/obsidian-plugin/{main.js,manifest.json,styles.css}` into your vault at
`.obsidian/plugins/obsidian-second-brain/`, then enable **Second Brain** under Community plugins.
(On Android, put the same three files in the same folder of your phone's vault.)

## 2. Add your AI keys

Settings → Second Brain → **AI providers**. Paste a key for each AI you use (the right-hand box is the
model name; leave empty for the default, edit it when providers rename models).
Keys are pay-per-use API keys. A ChatGPT/Claude/Gemini *subscription* does not include API access.
Keys are stored only in the vault's `.obsidian/plugins/obsidian-second-brain/data.json`.

## 3. Use it

- Ribbon brain icon (or command **Open Second Brain**) opens the side panel.
- **Chat** tab: pick an AI and an agent. Changing either starts a new chat, so a chat always has exactly one AI.
  The line under the toolbar shows how much shared memory was sent (`🧠 6 facts · ~140 tokens`).
- **Remember** under any answer saves one short fact to shared memory after you confirm it.
- **History** tab: search every chat by text, AI and date. *Continue* reopens a chat on its original AI.
- Every chat is a Markdown note in `Chats/YYYY/MM/`.

## 4. Google Drive sync (one-time, ~5 minutes)

The plugin syncs `memory/`, `Chats/`, your projects/areas folders and About Me into a **"Second Brain"**
folder in My Drive. On a phone Google only allows a narrow permission (`drive.file`), so the plugin can see
only the files it created. It does **not** browse the rest of your Drive. To bring existing notes in, copy them into your vault once.

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project → **APIs & Services → Library → enable Google Drive API**.
2. **OAuth consent screen**: User type *External*, fill the app name and your email, add the scope `.../auth/drive.file`.
3. Set **Publishing status → In production**.
   If you leave it in *Testing*, Google expires the sign-in every 7 days and you must sign in again.
   (`drive.file` is a non-sensitive scope, so this should not need verification. If Google asks for it, tell me.)
4. **Credentials → Create credentials → OAuth client ID → type "TVs and Limited Input devices"**. Copy the client ID and secret.
5. Plugin settings → **Google Drive sync**: paste both, press **Sign in**, then type the shown code at google.com/device.
6. Repeat the sign-in on your other device (same client ID and secret). Both devices now share the folder.

Sync runs on start and every N minutes (default 10). Safety rules: it never deletes anything. If the same file
was edited on two devices, your local version is kept and the other is saved next to it as `*.conflict-<date>.md`.
Memory is stored as one file per device (`memory/phone-xxxx.jsonl`, `memory/pc-xxxx.jsonl`), so memory itself never conflicts.

## 5. Claude Desktop / Claude Code (optional)

Point the MCP server at the same vault and Claude reads and writes the same memory
(`remember`, `get_memory_pack`, `search_chats`, plus the earlier tools). See the README.
