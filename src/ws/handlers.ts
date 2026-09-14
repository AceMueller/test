import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { World } from "../state.js";
import type { EmbeddingProvider } from "../embeddings/index.js";
import type { Message } from "../types.js";
import type { ClientMessage, ServerMessage, MessageView } from "./protocol.js";

function toMessageView(m: Message): MessageView {
  return { id: m.id, authorId: m.authorId, authorName: m.authorName, authorType: m.authorType, text: m.text, ts: m.ts };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/**
 * Owns the mapping between connected WebSockets and their human
 * participant, and translates between the wire protocol and World
 * mutations. One instance is shared across all connections.
 */
export class ConnectionHub {
  private readonly participantToSocket = new Map<string, WebSocket>();

  constructor(
    private readonly world: World,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  registerConnection(ws: WebSocket): void {
    let participantId: string | undefined;

    ws.on("message", (raw: Buffer) => {
      void this.handleMessage(ws, raw, participantId, (id) => (participantId = id));
    });

    ws.on("close", () => {
      if (!participantId) return;
      this.world.removeParticipant(participantId);
      this.participantToSocket.delete(participantId);
      this.broadcastRoomList();
    });
  }

  private async handleMessage(
    ws: WebSocket,
    raw: Buffer,
    participantId: string | undefined,
    setParticipantId: (id: string) => void,
  ): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "invalid message" });
      return;
    }

    if (msg.type === "join") {
      const name = (msg.name ?? "").trim().slice(0, 32) || "Anonymous";
      const participant = this.world.addParticipant(name, "human");
      setParticipantId(participant.id);
      this.participantToSocket.set(participant.id, ws);
      send(ws, { type: "welcome", participantId: participant.id, roomId: participant.currentRoomId });
      this.sendRoomState(ws, participant.currentRoomId);
      this.broadcastRoomList();
      return;
    }

    if (!participantId) {
      send(ws, { type: "error", message: "join first" });
      return;
    }

    if (msg.type === "chat") {
      const text = (msg.text ?? "").trim().slice(0, 500);
      if (!text) return;
      // Re-read the participant after the embedding await below, in case a
      // merge/fracture tick moved them to a different room in the meantime.
      const embedding = await this.embeddings.embed(text);
      const participant = this.world.participants.get(participantId);
      if (!participant) return;
      const message = this.world.addMessage(participant.currentRoomId, {
        id: randomUUID(),
        authorId: participant.id,
        authorName: participant.name,
        authorType: "human",
        text,
        embedding,
        ts: Date.now(),
      });
      if (message) {
        this.broadcastMessage(participant.currentRoomId, message);
        this.broadcastRoomList();
      }
      return;
    }

    if (msg.type === "switchRoom") {
      const participant = this.world.participants.get(participantId);
      if (!participant || !this.world.getRoom(msg.roomId)) return;
      this.world.moveParticipant(participant.id, msg.roomId);
      this.sendRoomState(ws, msg.roomId);
      this.broadcastRoomList();
      return;
    }
  }

  sendRoomState(ws: WebSocket, roomId: string): void {
    const room = this.world.getRoom(roomId);
    if (!room) return;
    send(ws, { type: "roomState", roomId: room.id, label: room.label, messages: room.messages.map(toMessageView) });
  }

  broadcastRoomList(): void {
    const rooms = this.world.summarize();
    for (const ws of this.participantToSocket.values()) send(ws, { type: "roomList", rooms });
  }

  broadcastMessage(roomId: string, message: Message): void {
    this.broadcastToRoom(roomId, { type: "message", roomId, message: toMessageView(message) });
  }

  broadcastToRoom(roomId: string, msg: ServerMessage): void {
    const room = this.world.getRoom(roomId);
    if (!room) return;
    for (const pid of room.participantIds) {
      const ws = this.participantToSocket.get(pid);
      if (ws) send(ws, msg);
    }
  }

  broadcastToAll(msg: ServerMessage): void {
    for (const ws of this.participantToSocket.values()) send(ws, msg);
  }

  /** After a tick that merged/fractured rooms, every client's view of "their" room may be stale -- resend it. */
  refreshAllRoomViews(): void {
    for (const [participantId, ws] of this.participantToSocket) {
      const participant = this.world.participants.get(participantId);
      if (participant) this.sendRoomState(ws, participant.currentRoomId);
    }
  }
}
