import matter from "gray-matter";
import type { VaultReader } from "../vault/VaultReader.js";
import type { NotePath } from "../vault/types.js";
import { slugify } from "../util/slugify.js";

export interface CreateNoteInput {
  title: string;
  /** Markdown body (without frontmatter). */
  body: string;
  /** Folder to file the note under, e.g. `memory`. Default: vault root. */
  folder?: string;
  tags?: string[];
  /** Extra frontmatter fields. */
  frontmatter?: Record<string, unknown>;
}

export interface CreateNoteResult {
  path: NotePath;
  created: boolean;
}

/**
 * Write a note back into the vault — the mechanism by which an AI persists new
 * memories. Builds YAML frontmatter (created date, source, tags) and avoids
 * clobbering an existing file by appending a numeric suffix.
 */
export async function createNote(
  vault: VaultReader,
  input: CreateNoteInput,
): Promise<CreateNoteResult> {
  const folder = input.folder?.replace(/\/+$/, "");
  const baseName = slugify(input.title) || "untitled";
  let path = join(folder, `${baseName}.md`);
  let n = 1;
  while (await vault.exists(path)) {
    n += 1;
    path = join(folder, `${baseName}-${n}.md`);
  }

  const data: Record<string, unknown> = {
    title: input.title,
    created: new Date().toISOString(),
    source: "ai-memory",
    ...input.frontmatter,
  };
  if (input.tags && input.tags.length > 0) data.tags = input.tags;

  const content = matter.stringify(`\n${input.body.trim()}\n`, data);
  await vault.write(path, content);
  return { path, created: true };
}

function join(folder: string | undefined, file: string): NotePath {
  return folder ? `${folder}/${file}` : file;
}
