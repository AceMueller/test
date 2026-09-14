import { hashEmbed } from "./hashEmbedding.js";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * Picks an embedding provider based on EMBEDDING_PROVIDER. Defaults to the
 * offline hashing embedder, which works with zero setup anywhere. See
 * transformersEmbedding.ts for why the alternative isn't the default.
 */
export function createEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const kind = env.EMBEDDING_PROVIDER ?? "hash";

  if (kind === "transformers") {
    // Lazy require so the (optional, not installed by default) dependency
    // is only touched if explicitly requested.
    return {
      async embed(text: string) {
        const { createTransformersEmbeddingProvider } = await import("./transformersEmbedding.js");
        return createTransformersEmbeddingProvider().embed(text);
      },
    };
  }

  return {
    async embed(text: string) {
      return hashEmbed(text);
    },
  };
}
