import type { NoteId } from "../vault/types.js";
import type { GraphModel } from "../graph/GraphModel.js";
import { cosineSimilarity } from "../util/cosine.js";

/** A suggested wikilink between two semantically related, not-yet-linked notes. */
export interface LinkSuggestion {
  from: NoteId;
  to: NoteId;
  similarity: number;
}

/**
 * Suggest `[[links]]` for a note: find the most similar notes (by vector) that
 * it does not already link to. Existing edges in `graph` are excluded so we
 * only surface genuinely new connections.
 */
export function suggestLinks(
  graph: GraphModel,
  noteId: NoteId,
  vectors: Map<NoteId, number[]>,
  options: { threshold?: number; limit?: number } = {},
): LinkSuggestion[] {
  const threshold = options.threshold ?? 0.6;
  const limit = options.limit ?? 5;
  const source = vectors.get(noteId);
  if (!source) return [];

  const alreadyLinked = new Set<string>(
    graph
      .outgoing(noteId)
      .filter((e) => e.kind === "link" || e.kind === "embed")
      .map((e) => e.to),
  );

  const suggestions: LinkSuggestion[] = [];
  for (const [otherId, vec] of vectors) {
    if (otherId === noteId || alreadyLinked.has(otherId)) continue;
    const similarity = cosineSimilarity(source, vec);
    if (similarity >= threshold) {
      suggestions.push({ from: noteId, to: otherId, similarity });
    }
  }
  return suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
