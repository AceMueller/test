import type { MessageGenerator } from "./bot.js";

/**
 * Fallback used when ANTHROPIC_API_KEY isn't set: cycles a persona through
 * its own canned phrase list. Deliberately reuses the same small
 * topic-specific vocabulary every time (like a real persona would), which
 * is what the merge/fracture engine's hash embedder needs to get a usable
 * signal -- see rooms/engine.ts.
 */
export function createScriptedBot(): MessageGenerator {
  const cursors = new Map<string, number>();

  return {
    async generate(persona) {
      const i = cursors.get(persona.id) ?? 0;
      cursors.set(persona.id, (i + 1) % persona.seedPhrases.length);
      return persona.seedPhrases[i];
    },
  };
}
