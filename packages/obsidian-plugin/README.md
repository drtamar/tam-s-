# Second Brain — Obsidian plugin

Runs the second-brain router and portable memory loader **inside Obsidian**, on
desktop and **Android** (the bundle is mobile-safe — no Node-only deps). It
reuses the same `@osb/core` engine as the CLI and MCP server, reading and
writing through the Obsidian `Vault` API.

## Commands

- **Route current note as a brain dump** — classify the active note into the
  best project/area and file a dated summary under its log (confirm modal, or
  auto per settings).
- **Process inbox** — route every note in the configured inbox folder.
- **Build memory loader (copy + save)** — regenerate the portable, LLM-agnostic
  memory loader, save it to the configured note, and copy it to the clipboard so
  you can paste it into any other LLM.

## Settings — what / how / why

The settings tab mirrors the shared `MemoryConfig`: **what** (projects/areas/
inbox/About-Me/loader notes + classifier guidance), **how** (log heading,
autonomy, auto-create, confidence, summary style, explain-routing), **why**
(purpose), and the **LLM** provider + API key (stored in this vault's plugin
data).

## Build & install (manual)

```bash
pnpm --filter @osb/obsidian-plugin build   # produces main.js
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at
`.obsidian/plugins/obsidian-second-brain/`, then enable **Second Brain** in
Obsidian's Community Plugins settings. On Android, sync those three files into
the same plugin folder of your synced vault.
