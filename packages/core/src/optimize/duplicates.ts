import type { NoteId } from "../vault/types.js";
import { cosineSimilarity } from "../util/cosine.js";

/** A pair of notes whose content is highly similar. */
export interface DuplicateProposal {
  a: NoteId;
  b: NoteId;
  similarity: number;
}

/**
 * Flag near-duplicate notes by cosine similarity over note-level vectors
 * (e.g. the mean of each note's chunk vectors). Returns pairs above `threshold`,
 * highest similarity first.
 */
export function proposeDuplicates(
  vectors: Map<NoteId, number[]>,
  threshold = 0.92,
): DuplicateProposal[] {
  const entries = [...vectors.entries()];
  const out: DuplicateProposal[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, va] = entries[i] as [NoteId, number[]];
      const [b, vb] = entries[j] as [NoteId, number[]];
      const similarity = cosineSimilarity(va, vb);
      if (similarity >= threshold) out.push({ a, b, similarity });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}
