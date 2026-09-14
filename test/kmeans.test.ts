import { test } from "node:test";
import assert from "node:assert/strict";
import { kmeans2, splitQuality } from "../src/rooms/kmeans.js";

const clusterA = [
  [1, 0, 0, 0],
  [0.9, 0.1, 0, 0],
  [0.95, 0.05, 0, 0],
];
const clusterB = [
  [0, 1, 0, 0],
  [0.1, 0.9, 0, 0],
  [0.05, 0.95, 0, 0],
];

test("kmeans2 separates two well-separated groups", () => {
  const result = kmeans2([...clusterA, ...clusterB]);
  assert.ok(result);
  const { assignments } = result!;
  // The first 3 (clusterA) should all share one label, the last 3 (clusterB) the other.
  assert.ok(assignments.slice(0, 3).every((a) => a === assignments[0]));
  assert.ok(assignments.slice(3, 6).every((a) => a === assignments[3]));
  assert.notEqual(assignments[0], assignments[3]);
});

test("kmeans2 on fewer than 2 vectors returns undefined", () => {
  assert.equal(kmeans2([]), undefined);
  assert.equal(kmeans2([[1, 0]]), undefined);
});

test("splitQuality is high for a clean, well-separated split", () => {
  const vectors = [...clusterA, ...clusterB];
  const result = kmeans2(vectors)!;
  const quality = splitQuality(vectors, result.assignments, result.centroids);
  assert.ok(quality > 0.3, `expected high split quality, got ${quality}`);
});

test("splitQuality is low when the input is really one cluster", () => {
  const vectors = [
    [1, 0, 0, 0],
    [0.99, 0.01, 0, 0],
    [0.98, 0.02, 0, 0],
    [0.97, 0.03, 0, 0],
  ];
  const result = kmeans2(vectors)!;
  const quality = splitQuality(vectors, result.assignments, result.centroids);
  assert.ok(quality < 0.05, `expected low split quality, got ${quality}`);
});
