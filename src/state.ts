import { randomUUID } from "node:crypto";
import type { Message, Participant, Room, RoomSummary } from "./types.js";

export const LOBBY_ROOM_ID = "lobby";

/**
 * Holds all in-memory world state (rooms, participants, messages) and the
 * low-level mutation operations on it. Decision-making (when to merge or
 * fracture, and how to split) lives in rooms/engine.ts and operates on top
 * of these primitives.
 */
export class World {
  readonly rooms = new Map<string, Room>();
  readonly participants = new Map<string, Participant>();

  constructor() {
    this.rooms.set(LOBBY_ROOM_ID, {
      id: LOBBY_ROOM_ID,
      label: "Lobby",
      createdAt: Date.now(),
      messages: [],
      participantIds: new Set(),
      cooldownUntil: 0,
    });
  }

  createRoom(label: string): Room {
    const room: Room = {
      id: randomUUID(),
      label,
      createdAt: Date.now(),
      messages: [],
      participantIds: new Set(),
      cooldownUntil: 0,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  listRooms(): Room[] {
    return [...this.rooms.values()];
  }

  addParticipant(name: string, type: Participant["type"], roomId: string = LOBBY_ROOM_ID): Participant {
    const participant: Participant = {
      id: randomUUID(),
      name,
      type,
      currentRoomId: roomId,
      connectedAt: Date.now(),
    };
    this.participants.set(participant.id, participant);
    this.getRoom(roomId)?.participantIds.add(participant.id);
    return participant;
  }

  removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant) return;
    this.getRoom(participant.currentRoomId)?.participantIds.delete(participantId);
    this.participants.delete(participantId);
    this.pruneEmptyRooms();
  }

  /** Moves a participant to a different room (e.g. a human switching which room they're viewing). */
  moveParticipant(participantId: string, newRoomId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant || !this.rooms.has(newRoomId)) return;
    this.getRoom(participant.currentRoomId)?.participantIds.delete(participantId);
    participant.currentRoomId = newRoomId;
    this.getRoom(newRoomId)?.participantIds.add(participantId);
  }

  addMessage(roomId: string, message: Omit<Message, "roomId">): Message | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;
    const full: Message = { ...message, roomId };
    room.messages.push(full);
    return full;
  }

  /** Merges `mergedId` into `keepId`: messages/participants move over, `mergedId` is deleted. */
  mergeRooms(keepId: string, mergedId: string, cooldownMs: number): Room | undefined {
    const keep = this.getRoom(keepId);
    const merged = this.getRoom(mergedId);
    if (!keep || !merged || keep === merged) return undefined;

    keep.messages = [...keep.messages, ...merged.messages]
      .map((m) => ({ ...m, roomId: keep.id }))
      .sort((a, b) => a.ts - b.ts);

    for (const pid of merged.participantIds) {
      const participant = this.participants.get(pid);
      if (participant) participant.currentRoomId = keep.id;
      keep.participantIds.add(pid);
    }

    this.rooms.delete(mergedId);
    keep.cooldownUntil = Date.now() + cooldownMs;
    return keep;
  }

  /**
   * Splits `sourceId` into two rooms. `movingMessageIds` (and any participant
   * whose most recent message is among them) move into a newly created room
   * with `newLabel`; everything else stays in the source room.
   */
  fractureRoom(
    sourceId: string,
    movingMessageIds: Set<string>,
    newLabel: string,
    cooldownMs: number,
  ): { source: Room; created: Room } | undefined {
    const source = this.getRoom(sourceId);
    if (!source) return undefined;

    const created = this.createRoom(newLabel);
    const staying: Message[] = [];
    for (const message of source.messages) {
      if (movingMessageIds.has(message.id)) {
        created.messages.push({ ...message, roomId: created.id });
      } else {
        staying.push(message);
      }
    }
    source.messages = staying;

    // Reassign each participant currently in `source` based on where their
    // most recent message landed; a participant with no messages yet stays put.
    for (const pid of [...source.participantIds]) {
      const lastMessage = [...source.messages, ...created.messages]
        .filter((m) => m.authorId === pid)
        .sort((a, b) => b.ts - a.ts)[0];
      if (lastMessage && movingMessageIds.has(lastMessage.id)) {
        source.participantIds.delete(pid);
        created.participantIds.add(pid);
        const participant = this.participants.get(pid);
        if (participant) participant.currentRoomId = created.id;
      }
    }

    const now = Date.now();
    source.cooldownUntil = now + cooldownMs;
    created.cooldownUntil = now + cooldownMs;
    return { source, created };
  }

  pruneEmptyRooms(): void {
    for (const room of this.listRooms()) {
      if (room.id !== LOBBY_ROOM_ID && room.participantIds.size === 0) {
        this.rooms.delete(room.id);
      }
    }
  }

  summarize(): RoomSummary[] {
    return this.listRooms().map((r) => ({
      id: r.id,
      label: r.label,
      participantCount: r.participantIds.size,
      messageCount: r.messages.length,
    }));
  }
}
