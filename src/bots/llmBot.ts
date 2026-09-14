import Anthropic from "@anthropic-ai/sdk";
import type { MessageGenerator } from "./bot.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Used when ANTHROPIC_API_KEY is set: each message is generated live by Claude, in-persona. */
export function createLlmBot(client: Anthropic, model: string = DEFAULT_MODEL): MessageGenerator {
  return {
    async generate(persona, recentRoomMessages) {
      const context = recentRoomMessages.slice(-6).join("\n");
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 60,
          system:
            `You are ${persona.name}, a chat room participant who is really into ${persona.topic}. ` +
            "Write ONE short, casual chat message (under 20 words, no quotes, no markdown) that continues " +
            "the conversation naturally while staying on your own topic.",
          messages: [
            {
              role: "user",
              content: context
                ? `Recent chat in this room:\n${context}\n\nYour next message:`
                : "Start the conversation with your first message.",
            },
          ],
        });
        const block = response.content.find((b) => b.type === "text");
        const text = block && block.type === "text" ? block.text.trim() : "";
        return text || persona.seedPhrases[0];
      } catch {
        // Network hiccup, rate limit, etc -- keep the demo running rather than stalling a bot forever.
        return persona.seedPhrases[Math.floor(Math.random() * persona.seedPhrases.length)];
      }
    },
  };
}
