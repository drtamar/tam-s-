import type { VaultReader } from "../vault/VaultReader.js";
import { parseNote } from "../parse/parseNote.js";
import type { BrainDump } from "./types.js";

/**
 * Turn the notes in an inbox/daily folder into brain dumps for routing. Each
 * note becomes one dump (its body), tagged with the source note id so routed
 * entries can link back.
 */
export async function extractDumpsFromFolder(
  vault: VaultReader,
  folder: string,
): Promise<BrainDump[]> {
  const prefix = folder.replace(/\/+$/, "") + "/";
  const paths = (await vault.list()).filter((p) => p.startsWith(prefix));
  const dumps: BrainDump[] = [];
  for (const path of paths) {
    const note = parseNote(await vault.readFile(path));
    const text = note.body.trim();
    if (text) dumps.push({ id: note.id, text, source: note.id });
  }
  return dumps;
}

/** Build a single brain dump from raw text (e.g. CLI stdin or an argument). */
export function dumpFromText(text: string, id = `dump-${Date.now()}`): BrainDump {
  return { id, text };
}
