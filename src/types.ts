export type ParticipantType = "human" | "bot";

export interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
  currentRoomId: string;
  connectedAt: number;
}

export interface Message {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorType: ParticipantType;
  text: string;
  embedding: number[];
  ts: number;
}

export interface Room {
  id: string;
  label: string;
  createdAt: number;
  messages: Message[];
  participantIds: Set<string>;
  /** Room is exempt from merge/fracture evaluation until this timestamp. */
  cooldownUntil: number;
}

export type RoomSummary = {
  id: string;
  label: string;
  participantCount: number;
  messageCount: number;
};

export type WorldEvent =
  | { type: "room:merged"; keptRoomId: string; mergedRoomId: string; label: string }
  | { type: "room:fractured"; sourceRoomId: string; newRoomId: string; sourceLabel: string; newLabel: string };
