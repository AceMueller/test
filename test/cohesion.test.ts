import { test } from "node:test";
import assert from "node:assert/strict";
import { averagePairwiseCohesion, centroid, cosineSimilarity } from "../src/rooms/cohesion.js";

test("cosineSimilarity: identical vectors", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test("cosineSimilarity: orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity: opposite vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("cosineSimilarity: a zero vector has similarity 0", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("centroid: mean of orthogonal unit vectors is normalized and equidistant", () => {
  const c = centroid([[1, 0], [0, 1]]);
  assert.ok(Math.abs(c[0] - c[1]) < 1e-9);
  const norm = Math.sqrt(c[0] ** 2 + c[1] ** 2);
  assert.ok(Math.abs(norm - 1) < 1e-9);
});

test("centroid: empty input yields empty vector", () => {
  assert.deepEqual(centroid([]), []);
});

test("averagePairwiseCohesion: a single vector is trivially cohesive", () => {
  assert.equal(averagePairwiseCohesion([[1, 0]]), 1);
});

test("averagePairwiseCohesion: identical vectors are fully cohesive", () => {
  assert.equal(averagePairwiseCohesion([[1, 0], [1, 0], [1, 0]]), 1);
});

test("averagePairwiseCohesion: orthogonal vectors have zero cohesion", () => {
  assert.equal(averagePairwiseCohesion([[1, 0], [0, 1]]), 0);
});
