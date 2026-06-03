import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveConfig, type MemoryConfig } from "@osb/core";

function configPath(vaultDir: string): string {
  return path.join(vaultDir, ".osb", "config.json");
}

/** Load the memory policy from `<vault>/.osb/config.json` (defaults if absent). */
export async function loadMemoryConfig(vaultDir: string): Promise<MemoryConfig> {
  try {
    const raw = await fs.readFile(configPath(vaultDir), "utf8");
    return resolveConfig(JSON.parse(raw) as Partial<MemoryConfig>);
  } catch {
    return resolveConfig();
  }
}

/** Merge a partial policy over the stored one and persist it. Returns the result. */
export async function saveMemoryConfig(
  vaultDir: string,
  partial: Partial<MemoryConfig>,
): Promise<MemoryConfig> {
  const current = await loadMemoryConfig(vaultDir);
  const merged = resolveConfig({
    ...current,
    ...partial,
    llm: { ...current.llm, ...(partial.llm ?? {}) },
    drive: { ...current.drive, ...(partial.drive ?? {}) },
  });
  const p = configPath(vaultDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
