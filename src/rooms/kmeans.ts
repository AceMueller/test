import { centroid, cosineSimilarity } from "./cohesion.js";

export interface KMeansResult {
  assignments: number[]; // 0 or 1, parallel to the input vectors array
  centroids: [number[], number[]];
}

/**
 * A minimal k=2 means over cosine distance (1 - cosine similarity).
 * Deterministic: seeds from the first vector and the vector furthest from
 * it, so the same input always produces the same split (useful for tests
 * and for not surprising users with flaky splits).
 */
export function kmeans2(vectors: number[][], iterations = 10): KMeansResult | undefined {
  if (vectors.length < 2) return undefined;

  let c0 = vectors[0];
  let c1 = vectors[vectors.length - 1];
  if (cosineSimilarity(c0, c1) > 0.999) {
    let maxDist = -Infinity;
    let idx = 1;
    for (let i = 1; i < vectors.length; i++) {
      const dist = 1 - cosineSimilarity(c0, vectors[i]);
      if (dist > maxDist) {
        maxDist = dist;
        idx = i;
      }
    }
    c1 = vectors[idx];
  }

  let assignments = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    const nextAssignments = vectors.map((v, i) => {
      const d0 = 1 - cosineSimilarity(v, c0);
      const d1 = 1 - cosineSimilarity(v, c1);
      const assignment = d0 <= d1 ? 0 : 1;
      if (assignment !== assignments[i]) changed = true;
      return assignment;
    });
    assignments = nextAssignments;

    const groupA = vectors.filter((_, i) => assignments[i] === 0);
    const groupB = vectors.filter((_, i) => assignments[i] === 1);
    if (groupA.length === 0 || groupB.length === 0) break;
    c0 = centroid(groupA);
    c1 = centroid(groupB);
    if (!changed) break;
  }

  return { assignments, centroids: [c0, c1] };
}

/**
 * How well-separated a split is: average similarity of each vector to its
 * own cluster centroid, minus similarity between the two centroids. Higher
 * is a cleaner split; near zero (or negative) means the "split" isn't
 * meaningfully different from one cohesive group.
 */
export function splitQuality(vectors: number[][], assignments: number[], centroids: [number[], number[]]): number {
  if (vectors.length === 0) return 0;
  const [c0, c1] = centroids;
  let withinSim = 0;
  for (let i = 0; i < vectors.length; i++) {
    withinSim += cosineSimilarity(vectors[i], assignments[i] === 0 ? c0 : c1);
  }
  withinSim /= vectors.length;
  const betweenSim = cosineSimilarity(c0, c1);
  return withinSim - betweenSim;
}
