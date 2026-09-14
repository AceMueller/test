import { randomUUID } from "node:crypto";
import type { World } from "../state.js";
import type { EmbeddingProvider } from "../embeddings/index.js";
import type { Message } from "../types.js";

export interface Persona {
  id: string;
  name: string;
  topic: string;
  /** Used by the scripted fallback generator, and as a last-resort fallback for the LLM generator. */
  seedPhrases: string[];
}

export interface MessageGenerator {
  generate(persona: Persona, recentRoomMessages: string[]): Promise<string>;
}

/** Picks the LLM-backed generator if ANTHROPIC_API_KEY is set, otherwise the scripted fallback. */
export async function createMessageGenerator(env: NodeJS.ProcessEnv = process.env): Promise<MessageGenerator> {
  if (env.ANTHROPIC_API_KEY) {
    const [{ default: Anthropic }, { createLlmBot }] = await Promise.all([
      import("@anthropic-ai/sdk"),
      import("./llmBot.js"),
    ]);
    return createLlmBot(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
  }
  const { createScriptedBot } = await import("./scriptedBot.js");
  return createScriptedBot();
}

export const PERSONAS: Persona[] = [
  {
    id: "chef",
    name: "Chef Remy",
    topic: "home cooking and recipes",
    seedPhrases: [
      "what's your favorite pasta recipe for a weeknight dinner",
      "I love making fresh tomato sauce from scratch",
      "garlic and olive oil are essential in my kitchen",
      "simmer the tomato sauce for twenty minutes on low heat",
      "fresh basil in the sauce makes such a difference",
      "parmesan cheese on top of the pasta is a must",
      "my grandmother's pasta recipe uses three kinds of cheese",
      "I always toast the garlic before adding it to the sauce",
    ],
  },
  {
    id: "astro",
    name: "Nova",
    topic: "space exploration and rockets",
    seedPhrases: [
      "the rocket launch window opens next tuesday morning",
      "the rocket booster separated cleanly from the stage",
      "mission control confirmed the rocket reached orbit",
      "the astronauts began their scheduled spacewalk today",
      "telemetry from the rocket looks nominal so far",
      "the spacecraft docked with the station without issue",
      "engineers are reviewing booster performance after launch",
      "the next launch attempt depends on weather at the pad",
    ],
  },
  {
    id: "riff",
    name: "Riff",
    topic: "music and bands",
    seedPhrases: [
      "have you heard the new album that just dropped",
      "the guitar solo in that song is incredible",
      "I've been listening to this album on repeat all week",
      "the drummer's timing on that track is so tight",
      "this band's new album is a huge departure from their old sound",
      "the bassline on that song is so catchy",
      "I can't stop listening to this album",
      "their live show was even better than the album",
    ],
  },
  {
    id: "pixel",
    name: "Pixel",
    topic: "video games",
    seedPhrases: [
      "finally beat that boss fight after twenty tries",
      "this game's combat system feels so satisfying",
      "the new expansion adds a huge open world to explore",
      "I love the soundtrack in this game so much",
      "that final boss fight had an amazing soundtrack too",
      "the multiplayer update fixed most of the matchmaking issues",
      "speedrunners already found a skip in the new expansion",
      "this game's open world is bigger than the last one",
    ],
  },
];

interface BotHandle {
  participantId: string;
  persona: Persona;
}

/**
 * Spawns one bot participant per persona and, once started, has each of
 * them periodically post a message into whichever room they're currently
 * in -- driven purely through World/EmbeddingProvider, exactly like a human
 * participant would, so the merge/fracture engine can't tell the
 * difference.
 */
export class BotRunner {
  private readonly handles: BotHandle[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopped = true;

  constructor(
    private readonly world: World,
    private readonly embeddings: EmbeddingProvider,
    private readonly generator: MessageGenerator,
    private readonly onMessagePosted: (roomId: string, message: Message) => void,
  ) {}

  spawnAll(personas: Persona[] = PERSONAS): void {
    for (const persona of personas) {
      const participant = this.world.addParticipant(persona.name, "bot");
      this.handles.push({ participantId: participant.id, persona });
    }
  }

  start(minDelayMs = 5000, maxDelayMs = 15000): void {
    this.stopped = false;
    for (const handle of this.handles) this.scheduleNext(handle, minDelayMs, maxDelayMs);
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleNext(handle: BotHandle, minDelayMs: number, maxDelayMs: number): void {
    const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
    const timer = setTimeout(async () => {
      if (this.stopped) return;
      await this.postOnce(handle);
      if (!this.stopped) this.scheduleNext(handle, minDelayMs, maxDelayMs);
    }, delay);
    this.timers.set(handle.participantId, timer);
  }

  private async postOnce(handle: BotHandle): Promise<void> {
    const participant = this.world.participants.get(handle.participantId);
    if (!participant) return;
    const room = this.world.getRoom(participant.currentRoomId);
    if (!room) return;

    const recentText = room.messages.slice(-6).map((m) => `${m.authorName}: ${m.text}`);
    const text = await this.generator.generate(handle.persona, recentText);
    const embedding = await this.embeddings.embed(text);

    // A merge/fracture tick may have moved this participant elsewhere while we awaited above.
    const current = this.world.participants.get(handle.participantId);
    if (!current) return;
    const message = this.world.addMessage(current.currentRoomId, {
      id: randomUUID(),
      authorId: current.id,
      authorName: current.name,
      authorType: "bot",
      text,
      embedding,
      ts: Date.now(),
    });
    if (message) this.onMessagePosted(current.currentRoomId, message);
  }
}
