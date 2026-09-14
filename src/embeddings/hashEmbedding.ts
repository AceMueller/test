import { contentWords } from "../text.js";

/**
 * Dependency-free "hashing trick" bag-of-words embedder: hashes each
 * content word (stopwords/short words dropped) into a fixed-size vector via
 * feature hashing with a random sign, then L2-normalizes. This is a much
 * cruder signal than a real sentence embedding model, but calibrated
 * against realistic short chat messages it separates distinct topical
 * vocabularies with a wide margin (see the merge/fracture engine tests),
 * and it requires no network access or model download -- see
 * embeddings/index.ts for why that matters in this environment.
 *
 * Individual messages are short and lexically sparse, so single-message
 * vectors alone are noisy; the merge/fracture engine aggregates a
 * participant's recent messages into one vector before comparing, which is
 * where the real signal shows up.
 */

const DEFAULT_DIM = 512;

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashEmbed(text: string, dim: number = DEFAULT_DIM): number[] {
  const vec = new Array(dim).fill(0);
  for (const token of contentWords(text)) {
    const h = fnv1a(token);
    const idx = h % dim;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}
