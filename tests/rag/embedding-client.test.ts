import { describe, expect, it, vi } from "vitest";
import {
  assertCurrentEmbeddingIndex,
  embedText,
  RAG_ERROR_CODES,
  validateEmbedding,
  type RagEmbeddingClientConfig,
} from "@/lib/rag/embedding-client";

const currentConfig = {
  embedding: {
    provider: "ollama",
    model: "bge-m3",
    dimensions: 3,
    isCurrentIndexedIdentity: true,
  },
} satisfies RagEmbeddingClientConfig;

describe("provider-neutral embedding client", () => {
  it("validates a finite embedding with the expected dimensions", () => {
    expect(validateEmbedding([0.1, 0.2, 0.3], 3)).toEqual([0.1, 0.2, 0.3]);
  });

  it.each([
    { name: "empty", embedding: [] },
    { name: "wrong length", embedding: [0.1, 0.2] },
    { name: "non-number", embedding: [0.1, "0.2", 0.3] },
    { name: "NaN", embedding: [0.1, Number.NaN, 0.3] },
    { name: "infinite", embedding: [0.1, Number.POSITIVE_INFINITY, 0.3] },
  ])("rejects an $name embedding with a stable error code", ({ embedding }) => {
    expect(() => validateEmbedding(embedding, 3)).toThrow(RAG_ERROR_CODES.INVALID_EMBEDDING);
  });

  it("fails fast when the configured embedding identity is not the current vector index", () => {
    expect(() =>
      assertCurrentEmbeddingIndex({
        embedding: {
          ...currentConfig.embedding,
          model: "text-embedding-3-large",
          dimensions: 3072,
          isCurrentIndexedIdentity: false,
        },
      }),
    ).toThrow(RAG_ERROR_CODES.EMBEDDING_INDEX_INCOMPATIBLE);
  });

  it("also accepts the provider config index compatibility field", () => {
    expect(() =>
      assertCurrentEmbeddingIndex({
        embedding: {
          provider: "openai",
          model: "text-embedding-3-large",
          dimensions: 3072,
          indexCompatible: false,
        },
      }),
    ).toThrow(RAG_ERROR_CODES.EMBEDDING_INDEX_INCOMPATIBLE);
  });

  it("uses an injected LangChain embedding model and validates its response", async () => {
    const embeddingModel = {
      embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    await expect(
      embedText("saved chunk", {
        config: currentConfig,
        embeddingModel,
      }),
    ).resolves.toEqual([0.1, 0.2, 0.3]);

    expect(embeddingModel.embedQuery).toHaveBeenCalledWith("saved chunk");
  });

  it("creates a model from an injected config and factory when no model is supplied", async () => {
    const embeddingModel = {
      embedQuery: vi.fn().mockResolvedValue([0.4, 0.5, 0.6]),
    };
    const getRagModelConfig = vi.fn().mockResolvedValue(currentConfig);
    const createEmbeddingModel = vi.fn().mockResolvedValue(embeddingModel);

    await expect(
      embedText("question", {
        getRagModelConfig,
        createEmbeddingModel,
      }),
    ).resolves.toEqual([0.4, 0.5, 0.6]);

    expect(getRagModelConfig).toHaveBeenCalledTimes(1);
    expect(createEmbeddingModel).toHaveBeenCalledWith(currentConfig);
    expect(embeddingModel.embedQuery).toHaveBeenCalledWith("question");
  });

  it("maps provider request failures to a stable embedding request error", async () => {
    await expect(
      embedText("saved chunk", {
        config: currentConfig,
        embeddingModel: {
          embedQuery: vi.fn().mockRejectedValue(new Error("provider unavailable")),
        },
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED);
  });
});
