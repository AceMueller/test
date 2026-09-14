import type { ParticipantType, RoomSummary, WorldEvent } from "../types.js";

/** Client-facing view of a message -- the embedding vector is server-internal only. */
export interface MessageView {
  id: string;
  authorId: string;
  authorName: string;
  authorType: ParticipantType;
  text: string;
  ts: number;
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "chat"; text: string }
  | { type: "switchRoom"; roomId: string };

export type ServerMessage =
  | { type: "welcome"; participantId: string; roomId: string }
  | { type: "roomState"; roomId: string; label: string; messages: MessageView[] }
  | { type: "roomList"; rooms: RoomSummary[] }
  | { type: "message"; roomId: string; message: MessageView }
  | { type: "event"; event: WorldEvent }
  | { type: "error"; message: string };
