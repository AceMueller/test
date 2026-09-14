import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { World, LOBBY_ROOM_ID } from "../src/state.js";
import { runTick, type EngineConfig } from "../src/rooms/engine.js";
import { hashEmbed } from "../src/embeddings/hashEmbedding.js";

const testConfig: EngineConfig = {
  windowSize: 8,
  minMessagesPerParticipant: 3,
  minParticipantsForFracture: 2,
  fractureThreshold: 0.15,
  mergeThreshold: 0.25,
  minSplitQuality: 0.05,
  cooldownMs: 20_000,
};

function post(world: World, roomId: string, authorId: string, text: string, tsOffset: number) {
  return world.addMessage(roomId, {
    id: randomUUID(),
    authorId,
    authorName: authorId,
    authorType: "bot",
    text,
    embedding: hashEmbed(text),
    ts: Date.now() + tsOffset,
  });
}

// Realistic-ish chat: a persona naturally reuses its own core topic nouns
// across messages, the way a real conversation (or a bot with a persona)
// would -- unlike a carefully vocabulary-diversified sentence list.
const COOKING = [
  "what's your favorite pasta recipe for a weeknight dinner",
  "I love making fresh tomato sauce from scratch",
  "garlic and olive oil are essential in my kitchen",
  "simmer the tomato sauce for twenty minutes on low heat",
  "fresh basil in the sauce makes such a difference",
  "parmesan cheese on top of the pasta is a must",
  "my grandmother's pasta recipe uses three kinds of cheese",
  "I always toast the garlic before adding it to the sauce",
];

const SPACE = [
  "the rocket launch window opens next tuesday morning",
  "the rocket booster separated cleanly from the stage",
  "mission control confirmed the rocket reached orbit",
  "the astronauts began their scheduled spacewalk today",
  "telemetry from the rocket looks nominal so far",
  "the spacecraft docked with the station without issue",
  "engineers are reviewing booster performance after launch",
  "the next launch attempt depends on weather at the pad",
];

test("a room fractures when two participants build up distinct topics", () => {
  const world = new World();
  const alice = world.addParticipant("alice", "human");
  const bob = world.addParticipant("bob", "human");

  let offset = 0;
  for (let i = 0; i < COOKING.length; i++) {
    post(world, LOBBY_ROOM_ID, alice.id, COOKING[i], offset++);
    post(world, LOBBY_ROOM_ID, bob.id, SPACE[i], offset++);
  }

  const events = runTick(world, testConfig);
  const fractureEvents = events.filter((e) => e.type === "room:fractured");
  assert.equal(fractureEvents.length, 1, `expected a fracture, got events: ${JSON.stringify(events)}`);
  assert.equal(world.listRooms().length, 2);
});

test("a room does not fracture when two participants share a topic", () => {
  const world = new World();
  const alice = world.addParticipant("alice", "human");
  const bob = world.addParticipant("bob", "human");

  let offset = 0;
  for (let i = 0; i < COOKING.length; i++) {
    post(world, LOBBY_ROOM_ID, alice.id, COOKING[i], offset++);
    post(world, LOBBY_ROOM_ID, bob.id, COOKING[(i + 3) % COOKING.length], offset++);
  }

  const events = runTick(world, testConfig);
  assert.equal(events.filter((e) => e.type === "room:fractured").length, 0);
  assert.equal(world.listRooms().length, 1);
});

test("two rooms merge when their topics converge", () => {
  const world = new World();
  const roomA = world.createRoom("Room A");
  const roomB = world.createRoom("Room B");
  const alice = world.addParticipant("alice", "human", roomA.id);
  const bob = world.addParticipant("bob", "human", roomB.id);

  let offset = 0;
  for (const text of COOKING) {
    post(world, roomA.id, alice.id, text, offset++);
    post(world, roomB.id, bob.id, text, offset++);
  }

  const events = runTick(world, testConfig);
  const mergeEvents = events.filter((e) => e.type === "room:merged");
  assert.equal(mergeEvents.length, 1, `expected a merge, got events: ${JSON.stringify(events)}`);
  // lobby (empty, exempt from pruning) + the merged room
  assert.equal(world.listRooms().length, 2);
});

test("two rooms on unrelated topics do not merge", () => {
  const world = new World();
  const roomA = world.createRoom("Room A");
  const roomB = world.createRoom("Room B");
  const alice = world.addParticipant("alice", "human", roomA.id);
  const bob = world.addParticipant("bob", "human", roomB.id);

  let offset = 0;
  for (let i = 0; i < COOKING.length; i++) {
    post(world, roomA.id, alice.id, COOKING[i], offset++);
    post(world, roomB.id, bob.id, SPACE[i], offset++);
  }

  const events = runTick(world, testConfig);
  assert.equal(events.filter((e) => e.type === "room:merged").length, 0);
});

test("a merged room is exempt from further changes during its cooldown", () => {
  const world = new World();
  const roomA = world.createRoom("Room A");
  const roomB = world.createRoom("Room B");
  const alice = world.addParticipant("alice", "human", roomA.id);
  const bob = world.addParticipant("bob", "human", roomB.id);

  let offset = 0;
  for (const text of COOKING) {
    post(world, roomA.id, alice.id, text, offset++);
    post(world, roomB.id, bob.id, text, offset++);
  }

  const now = Date.now();
  const firstTickEvents = runTick(world, testConfig, now);
  assert.equal(firstTickEvents.filter((e) => e.type === "room:merged").length, 1);

  // Immediately re-run at the same instant: the merged room is on cooldown, nothing else to merge.
  const secondTickEvents = runTick(world, testConfig, now);
  assert.equal(secondTickEvents.length, 0);
});

test("a lone participant never fractures a room (nothing to split against)", () => {
  const world = new World();
  const alice = world.addParticipant("alice", "human");
  let offset = 0;
  for (const text of [...COOKING, ...SPACE]) {
    post(world, LOBBY_ROOM_ID, alice.id, text, offset++);
  }
  const events = runTick(world, testConfig);
  assert.equal(events.filter((e) => e.type === "room:fractured").length, 0);
});
