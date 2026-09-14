/**
 * Optional real sentence-embedding provider backed by a local transformer
 * model via @xenova/transformers. Not installed by default: this repo's
 * dev sandbox blocks huggingface.co (where the model weights come from), so
 * this path can't be built/tested here. If your environment has network
 * access to huggingface.co, run `npm install @xenova/transformers` and set
 * EMBEDDING_PROVIDER=transformers -- everything else (cohesion, merge,
 * fracture) works unchanged since it only depends on the EmbeddingProvider
 * interface in ./index.ts.
 */
import type { EmbeddingProvider } from "./index.js";

export function createTransformersEmbeddingProvider(): EmbeddingProvider {
  let pipelinePromise: Promise<any> | undefined;

  async function getPipeline() {
    if (!pipelinePromise) {
      pipelinePromise = import("@xenova/transformers")
        .then(({ pipeline }) => pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"))
        .catch((err) => {
          throw new Error(
            "EMBEDDING_PROVIDER=transformers requires the optional '@xenova/transformers' " +
              "package (npm install @xenova/transformers) and network access to huggingface.co. " +
              `Original error: ${err instanceof Error ? err.message : err}`,
          );
        });
    }
    return pipelinePromise;
  }

  return {
    async embed(text: string): Promise<number[]> {
      const extractor = await getPipeline();
      const output = await extractor(text, { pooling: "mean", normalize: true });
      return Array.from(output.data as Float32Array);
    },
  };
}
