const STOP = new Set(
  "a an the and or of to in on for with is are was were be it this that at by as from i you we my me your do does did not no".split(
    " ",
  ),
);

/** Lowercase word tokens, minus stopwords. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !STOP.has(w),
  );
}

/** Rough token estimate (~4 chars per token) used for budgets. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface Scored<T> {
  item: T;
  score: number;
}

/**
 * BM25 keyword ranking. Pure and tiny — chosen over embeddings so search works
 * offline on a phone with no model download and no API cost.
 */
export function bm25<T>(
  items: T[],
  textOf: (item: T) => string,
  query: string,
  k1 = 1.4,
  b = 0.75,
): Scored<T>[] {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0 || items.length === 0) return [];

  const docs = items.map((item) => tokenize(textOf(item)));
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  const out: Scored<T>[] = [];
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.length) / avgLen));
    }
    if (score > 0) out.push({ item: items[i] as T, score });
  });
  return out.sort((a, b2) => b2.score - a.score);
}
