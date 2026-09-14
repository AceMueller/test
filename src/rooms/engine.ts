import type { Message, Room, WorldEvent } from "../types.js";
import type { World } from "../state.js";
import { averagePairwiseCohesion, centroid, cosineSimilarity } from "./cohesion.js";
import { kmeans2, splitQuality } from "./kmeans.js";
import { contentWords } from "../text.js";

export interface EngineConfig {
  /** How many of a participant's most recent messages (in a given room) are aggregated into their topic vector. */
  windowSize: number;
  /** A participant needs at least this many messages in a room before they count toward fracture clustering. */
  minMessagesPerParticipant: number;
  /** Need at least this many distinct qualifying participants in a room to attempt a fracture. */
  minParticipantsForFracture: number;
  /** Average pairwise similarity between participants' topic vectors below this triggers a fracture attempt. */
  fractureThreshold: number;
  /** Room-centroid similarity at/above this triggers a merge. */
  mergeThreshold: number;
  /** Minimum k-means split quality required to actually apply a fracture. */
  minSplitQuality: number;
  /** How long a room touched by a merge/fracture is exempt from further evaluation. */
  cooldownMs: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  return {
    windowSize: Number(env.ROOM_WINDOW_SIZE ?? 8),
    minMessagesPerParticipant: Number(env.MIN_MESSAGES_PER_PARTICIPANT ?? 3),
    minParticipantsForFracture: Number(env.MIN_PARTICIPANTS_FOR_FRACTURE ?? 2),
    fractureThreshold: Number(env.FRACTURE_THRESHOLD ?? 0.15),
    mergeThreshold: Number(env.MERGE_THRESHOLD ?? 0.25),
    minSplitQuality: Number(env.MIN_SPLIT_QUALITY ?? 0.05),
    cooldownMs: Number(env.ROOM_COOLDOWN_MS ?? 20_000),
  };
}

export function labelFromMessages(messages: Message[]): string {
  const freq = new Map<string, number>();
  for (const message of messages) {
    for (const word of contentWords(message.text)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([word]) => word);
  return top.length ? top.join(" / ") : "Room";
}

/**
 * Each qualifying participant's "topic vector" for this room: the centroid
 * of their own last `windowSize` messages here. Aggregating per-participant
 * (rather than comparing raw per-message vectors) is what gives a usable
 * signal with the hash embedder -- single short messages are too sparse to
 * compare reliably, but a handful of a participant's messages together are
 * not.
 */
function participantVectors(room: Room, windowSize: number, minMessages: number): Map<string, number[]> {
  const byAuthor = new Map<string, Message[]>();
  for (const message of room.messages) {
    const list = byAuthor.get(message.authorId);
    if (list) list.push(message);
    else byAuthor.set(message.authorId, [message]);
  }

  const vectors = new Map<string, number[]>();
  for (const [authorId, messages] of byAuthor) {
    if (messages.length < minMessages) continue;
    vectors.set(authorId, centroid(messages.slice(-windowSize).map((m) => m.embedding)));
  }
  return vectors;
}

function roomCentroid(room: Room, config: EngineConfig): number[] {
  return centroid([...participantVectors(room, config.windowSize, 1).values()]);
}

export interface FractureDecision {
  movingMessageIds: Set<string>;
  newLabel: string;
}

/** Pure decision function: should `room` fracture right now, and if so, which messages move out? */
export function evaluateFracture(room: Room, config: EngineConfig, now: number): FractureDecision | undefined {
  if (now < room.cooldownUntil) return undefined;

  const pVectors = participantVectors(room, config.windowSize, config.minMessagesPerParticipant);
  if (pVectors.size < config.minParticipantsForFracture) return undefined;

  const authorIds = [...pVectors.keys()];
  const vectors = authorIds.map((id) => pVectors.get(id)!);
  if (averagePairwiseCohesion(vectors) >= config.fractureThreshold) return undefined;

  const split = kmeans2(vectors);
  if (!split) return undefined;

  const groupA = authorIds.filter((_, i) => split.assignments[i] === 0);
  const groupB = authorIds.filter((_, i) => split.assignments[i] === 1);
  if (groupA.length === 0 || groupB.length === 0) return undefined;

  if (splitQuality(vectors, split.assignments, split.centroids) < config.minSplitQuality) return undefined;

  // The smaller group of participants splits off; the room keeps its identity/majority.
  const movingAuthors = new Set(groupA.length <= groupB.length ? groupA : groupB);
  const movingMessages = room.messages.filter((m) => movingAuthors.has(m.authorId));
  if (movingMessages.length === 0) return undefined;

  return {
    movingMessageIds: new Set(movingMessages.map((m) => m.id)),
    newLabel: labelFromMessages(movingMessages),
  };
}

export interface MergeDecision {
  keepId: string;
  mergedId: string;
}

/** Pure decision function: is there a pair of rooms similar enough to merge right now? */
export function evaluateMerge(rooms: Room[], config: EngineConfig, now: number): MergeDecision | undefined {
  const eligible = rooms.filter((r) => now >= r.cooldownUntil && r.messages.length > 0);

  let best: (MergeDecision & { sim: number }) | undefined;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      const sim = cosineSimilarity(roomCentroid(a, config), roomCentroid(b, config));
      if (sim >= config.mergeThreshold && (!best || sim > best.sim)) {
        const [keep, merged] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
        best = { keepId: keep.id, mergedId: merged.id, sim };
      }
    }
  }
  return best ? { keepId: best.keepId, mergedId: best.mergedId } : undefined;
}

/** Runs one evaluation pass over the whole world, mutating it and returning the events that occurred. */
export function runTick(world: World, config: EngineConfig, now: number = Date.now()): WorldEvent[] {
  const events: WorldEvent[] = [];

  for (const room of world.listRooms()) {
    const decision = evaluateFracture(room, config, now);
    if (!decision) continue;
    const outcome = world.fractureRoom(room.id, decision.movingMessageIds, decision.newLabel, config.cooldownMs);
    if (outcome) {
      events.push({
        type: "room:fractured",
        sourceRoomId: outcome.source.id,
        newRoomId: outcome.created.id,
        sourceLabel: outcome.source.label,
        newLabel: outcome.created.label,
      });
    }
  }

  let merge = evaluateMerge(world.listRooms(), config, now);
  while (merge) {
    const label = world.getRoom(merge.keepId)?.label ?? "Room";
    world.mergeRooms(merge.keepId, merge.mergedId, config.cooldownMs);
    events.push({ type: "room:merged", keptRoomId: merge.keepId, mergedRoomId: merge.mergedId, label });
    merge = evaluateMerge(world.listRooms(), config, now);
  }

  world.pruneEmptyRooms();
  return events;
}
