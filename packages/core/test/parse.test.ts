import { describe, expect, it } from "vitest";
import { parseNote } from "../src/parse/parseNote.js";
import { extractWikiLinks } from "../src/parse/wikilinks.js";
import { extractBodyTags } from "../src/parse/tags.js";

describe("wikilinks", () => {
  it("parses targets, aliases, headings, and embeds", () => {
    const links = extractWikiLinks(
      "See [[Note A]], [[Note B|alias]], [[Note C#Section]] and ![[image.png]].",
    );
    expect(links).toEqual([
      { target: "Note A", embed: false, heading: undefined, alias: undefined },
      { target: "Note B", embed: false, heading: undefined, alias: "alias" },
      { target: "Note C", embed: false, heading: "Section", alias: undefined },
      { target: "image.png", embed: true, heading: undefined, alias: undefined },
    ]);
  });
});

describe("tags", () => {
  it("extracts nested body tags but ignores bare numbers", () => {
    expect(extractBodyTags("a #project/alpha and #todo but not #123")).toEqual([
      "project/alpha",
      "todo",
    ]);
  });
});

describe("parseNote", () => {
  it("merges frontmatter and body tags and strips frontmatter from body", () => {
    const note = parseNote({
      path: "Welcome.md",
      content: "---\ntags: [start]\n---\n\n# Hi\n\n#extra link [[X]]",
    });
    expect(note.id).toBe("Welcome");
    expect(note.title).toBe("Welcome");
    expect(note.tags).toEqual(["extra", "start"]);
    expect(note.links.map((l) => l.target)).toEqual(["X"]);
    expect(note.body).not.toContain("tags:");
  });
});
