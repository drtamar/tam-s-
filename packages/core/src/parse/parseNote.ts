import matter from "gray-matter";
import type { NoteId, NotePath, VaultFile } from "../vault/types.js";
import { noteTitle, pathToId } from "../util/ids.js";
import { extractWikiLinks, type WikiLink } from "./wikilinks.js";
import {
  extractBodyTags,
  normalizeFrontmatterTags,
  normalizeTag,
} from "./tags.js";
import { extractHeadings, type Heading } from "./headings.js";

/** A fully parsed note: frontmatter, links, tags, headings, and body text. */
export interface ParsedNote {
  id: NoteId;
  path: NotePath;
  title: string;
  frontmatter: Record<string, unknown>;
  /** Markdown body with frontmatter stripped. */
  body: string;
  /** Outgoing wikilinks and embeds, in document order. */
  links: WikiLink[];
  /** Tags from both the body and frontmatter, normalized and de-duplicated. */
  tags: string[];
  headings: Heading[];
  mtimeMs?: number;
}

/** Parse a markdown file into the structured representation the engine uses. */
export function parseNote(file: VaultFile): ParsedNote {
  const { data: frontmatter, content: body } = matter(file.content);

  const bodyTags = extractBodyTags(body);
  const fmTags = normalizeFrontmatterTags((frontmatter as Record<string, unknown>).tags);
  const tags = [...new Set([...bodyTags, ...fmTags].map(normalizeTag))].sort();

  return {
    id: pathToId(file.path),
    path: file.path,
    title:
      typeof (frontmatter as Record<string, unknown>).title === "string"
        ? ((frontmatter as Record<string, unknown>).title as string)
        : noteTitle(file.path),
    frontmatter: frontmatter as Record<string, unknown>,
    body,
    links: extractWikiLinks(body),
    tags,
    headings: extractHeadings(body),
    mtimeMs: file.mtimeMs,
  };
}
