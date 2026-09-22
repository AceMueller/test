import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { World } from "../src/state.js";
import { createEmbeddingProvider } from "../src/embeddings/index.js";
import { ConnectionHub } from "../src/ws/handlers.js";

/** Minimal stand-in for a `ws` WebSocket -- just enough for ConnectionHub. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
}

function setup() {
  const world = new World();
  const embeddings = createEmbeddingProvider({ EMBEDDING_PROVIDER: "hash" } as NodeJS.ProcessEnv);
  const hub = new ConnectionHub(world, embeddings);
  const socket = new FakeSocket();
  hub.registerConnection(socket as unknown as import("ws").WebSocket);
  return { socket };
}

// Regression test for a real bug: `JSON.parse("null")` succeeds (null is
// valid JSON), so `msg.type` on the unguarded result threw a TypeError from
// inside an un-caught async handler -- an unhandled rejection that crashes
// the whole process (wiping all in-memory room state) on a single stray
// WebSocket frame from anyone on the open internet.
for (const raw of ["null", "42", '"just a string"', "[1,2,3]", "true"]) {
  test(`a non-object JSON frame (${raw}) is rejected, not thrown`, async () => {
    const { socket } = setup();
    assert.doesNotThrow(() => socket.emit("message", Buffer.from(raw)));
    await new Promise((r) => setTimeout(r, 10));
    const sent = socket.sent.map((s) => JSON.parse(s));
    assert.ok(sent.some((m) => m.type === "error"), `expected an error reply, got: ${JSON.stringify(sent)}`);
  });
}

test("a well-formed join still works after the type guard", async () => {
  const { socket } = setup();
  socket.emit("message", Buffer.from(JSON.stringify({ type: "join", name: "Tester" })));
  await new Promise((r) => setTimeout(r, 10));
  const sent = socket.sent.map((s) => JSON.parse(s));
  assert.ok(sent.some((m) => m.type === "welcome"));
});
